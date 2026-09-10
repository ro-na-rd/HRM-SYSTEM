const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');
const { notifyEmployee } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

function findOwnEmployeeId(userId) {
  const e = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(userId);
  return e ? e.id : null;
}

function isStaff(req) {
  return req.user.role === 'admin' || req.user.role === 'hr';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/; // HH:MM as entered by HR

// HR: whole register, optionally filtered by a single day or a range.
// Employee: only their own records.
router.get('/', (req, res) => {
  if (isStaff(req)) {
    const { date, from, to } = req.query;
    const where = [];
    const params = [];
    if (date && DATE_RE.test(date)) {
      where.push('a.work_date = ?');
      params.push(date);
    } else {
      if (from && DATE_RE.test(from)) {
        where.push('a.work_date >= ?');
        params.push(from);
      }
      if (to && DATE_RE.test(to)) {
        where.push('a.work_date <= ?');
        params.push(to);
      }
    }
    const rows = db
      .prepare(
        `SELECT a.*, e.full_name AS employee_name, e.department
         FROM attendance a JOIN employees e ON e.id = a.employee_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY a.work_date DESC, e.full_name ASC`
      )
      .all(...params);
    return res.json(rows);
  }

  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) return res.json([]);
  const rows = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? ORDER BY work_date DESC LIMIT 180')
    .all(employeeId);
  res.json(rows);
});

// Employee: today's own record (client passes its local date), for the
// clock in / clock out button state.
router.get('/today', (req, res) => {
  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) return res.json(null);
  const date = DATE_RE.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
  res.json(db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?').get(employeeId, date) || null);
});

const clockSchema = z.object({ work_date: z.string().regex(DATE_RE, 'Bad date') });

router.post('/clock-in', (req, res) => {
  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) {
    return res.status(400).json({ error: 'Your login isn’t linked to an employee record yet.' });
  }
  const parsed = clockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { work_date } = parsed.data;

  const existing = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?')
    .get(employeeId, work_date);
  if (existing && existing.clock_in) {
    return res.status(409).json({ error: 'You have already clocked in today.' });
  }

  const now = new Date().toISOString();
  if (existing) {
    db.prepare(`UPDATE attendance SET clock_in = ?, status = 'present', updated_at = ? WHERE id = ?`).run(
      now,
      now,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO attendance (employee_id, work_date, clock_in, status) VALUES (?, ?, ?, 'present')`
    ).run(employeeId, work_date, now);
  }
  writeAuditLog(req.user.id, 'attendance_clock_in', 'attendance', employeeId, { work_date });
  res.json(db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?').get(employeeId, work_date));
});

router.post('/clock-out', (req, res) => {
  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) {
    return res.status(400).json({ error: 'Your login isn’t linked to an employee record yet.' });
  }
  const parsed = clockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { work_date } = parsed.data;

  const existing = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?')
    .get(employeeId, work_date);
  if (!existing || !existing.clock_in) {
    return res.status(400).json({ error: 'Clock in first before clocking out.' });
  }
  if (existing.clock_out) {
    return res.status(409).json({ error: 'You have already clocked out today.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE attendance SET clock_out = ?, updated_at = ? WHERE id = ?').run(now, now, existing.id);
  writeAuditLog(req.user.id, 'attendance_clock_out', 'attendance', employeeId, { work_date });
  res.json(db.prepare('SELECT * FROM attendance WHERE id = ?').get(existing.id));
});

// HR manual entry / correction. Times come in as HH:MM on work_date and
// are stored as ISO timestamps for consistency with self clock records.
const manualSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  work_date: z.string().regex(DATE_RE, 'Pick a date'),
  clock_in: z.string().regex(TIME_RE).optional().nullable().or(z.literal('')),
  clock_out: z.string().regex(TIME_RE).optional().nullable().or(z.literal('')),
  status: z.enum(['present', 'absent', 'leave', 'remote', 'half_day']).default('present'),
  note: z.string().optional().nullable(),
});

function toIso(workDate, hhmm) {
  if (!hhmm) return null;
  const d = new Date(`${workDate}T${hhmm}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(d.employee_id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const clockIn = toIso(d.work_date, d.clock_in);
  const clockOut = toIso(d.work_date, d.clock_out);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, status, note, recorded_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(employee_id, work_date) DO UPDATE SET
       clock_in = excluded.clock_in,
       clock_out = excluded.clock_out,
       status = excluded.status,
       note = excluded.note,
       recorded_by = excluded.recorded_by,
       updated_at = excluded.updated_at`
  ).run(d.employee_id, d.work_date, clockIn, clockOut, d.status, d.note || null, req.user.id, now);

  writeAuditLog(req.user.id, 'attendance_recorded', 'attendance', d.employee_id, { work_date: d.work_date });
  notifyEmployee(d.employee_id, {
    type: 'attendance',
    title: 'Attendance updated',
    body: `Your attendance for ${d.work_date} was set to ${d.status.replace('_', ' ')} by HR.`,
    link: '/profile/attendance',
  });
  res.status(201).json(
    db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?').get(d.employee_id, d.work_date)
  );
});

router.delete('/:id', requireRole('admin', 'hr'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Record not found' });
  db.prepare('DELETE FROM attendance WHERE id = ?').run(id);
  writeAuditLog(req.user.id, 'attendance_deleted', 'attendance', row.employee_id, { work_date: row.work_date });
  res.json({ ok: true });
});

module.exports = router;

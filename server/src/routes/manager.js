// Team manager area (role 'manager', e.g. Rose). A manager keeps her own
// team: people with no login of their own (employees.managed_by = her user
// id). She adds them, records their attendance and records their leave.
// Her team is hidden from HR/Admin, and she can't see anyone else.
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth, requireRole('manager'));

// The team register started on this day; nothing can be recorded before it.
const TEAM_START_DATE = '2026-10-01';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const teamDate = z
  .string()
  .regex(DATE_RE, 'Pick a date')
  .refine((d) => d >= TEAM_START_DATE, 'Records start on 01/10/2026 - pick that date or later');

const TEAM_COLUMNS = 'id, full_name, position, phone, hire_date, notes, active, created_at';

// Returns the team member only if they belong to this manager.
function ownMember(req, employeeId) {
  return db
    .prepare(`SELECT ${TEAM_COLUMNS} FROM employees WHERE id = ? AND managed_by = ?`)
    .get(employeeId, req.user.id);
}

router.get('/summary', (req, res) => {
  const date = DATE_RE.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
  const team = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active
       FROM employees WHERE managed_by = ?`
    )
    .get(req.user.id);
  const day = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN a.status IN ('present', 'remote', 'half_day') THEN 1 ELSE 0 END), 0) AS present,
         COALESCE(SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END), 0) AS absent,
         COALESCE(SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END), 0) AS on_leave,
         COUNT(*) AS recorded
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE e.managed_by = ? AND a.work_date = ?`
    )
    .get(req.user.id, date);
  const onLeaveNow = db
    .prepare(
      `SELECT lr.id, lr.type, lr.start_date, lr.end_date, e.full_name AS employee_name
       FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
       WHERE e.managed_by = ? AND lr.start_date <= ? AND lr.end_date >= ?
       ORDER BY lr.end_date ASC`
    )
    .all(req.user.id, date, date);
  res.json({ start_date: TEAM_START_DATE, date, team, day, on_leave_now: onLeaveNow });
});

// ---------------------------------------------------------------------------
// Team members
// ---------------------------------------------------------------------------

router.get('/employees', (req, res) => {
  res.json(
    db
      .prepare(`SELECT ${TEAM_COLUMNS} FROM employees WHERE managed_by = ? ORDER BY active DESC, full_name ASC`)
      .all(req.user.id)
  );
});

const memberSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter a name'),
  position: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  hire_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

router.post('/employees', (req, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO employees (full_name, position, phone, hire_date, notes, managed_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(d.full_name, d.position || null, d.phone || null, d.hire_date || null, d.notes || null, req.user.id);
  writeAuditLog(req.user.id, 'team_member_added', 'employee', info.lastInsertRowid);
  res.status(201).json(ownMember(req, info.lastInsertRowid));
});

router.patch('/employees/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = ownMember(req, id);
  if (!existing) return res.status(404).json({ error: 'Team member not found' });
  const parsed = memberSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const m = { ...existing, ...parsed.data };
  db.prepare(
    `UPDATE employees SET full_name = ?, position = ?, phone = ?, hire_date = ?, notes = ?, active = ? WHERE id = ?`
  ).run(m.full_name, m.position || null, m.phone || null, m.hire_date || null, m.notes || null, m.active ? 1 : 0, id);
  writeAuditLog(req.user.id, 'team_member_updated', 'employee', id, { fields: Object.keys(parsed.data) });
  res.json(ownMember(req, id));
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

router.get('/attendance', (req, res) => {
  if (!DATE_RE.test(req.query.date || '')) return res.status(400).json({ error: 'Pick a date' });
  res.json(
    db
      .prepare(
        `SELECT a.*, e.full_name AS employee_name
         FROM attendance a JOIN employees e ON e.id = a.employee_id
         WHERE e.managed_by = ? AND a.work_date = ?
         ORDER BY e.full_name ASC`
      )
      .all(req.user.id, req.query.date)
  );
});

const attendanceSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  work_date: teamDate,
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

// Records (or overwrites) one team member's day.
router.post('/attendance', (req, res) => {
  const parsed = attendanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  if (!ownMember(req, d.employee_id)) return res.status(404).json({ error: 'Team member not found' });

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, status, note, recorded_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(employee_id, work_date) DO UPDATE SET
       clock_in = excluded.clock_in, clock_out = excluded.clock_out, status = excluded.status,
       note = excluded.note, recorded_by = excluded.recorded_by, updated_at = excluded.updated_at`
  ).run(
    d.employee_id,
    d.work_date,
    toIso(d.work_date, d.clock_in),
    toIso(d.work_date, d.clock_out),
    d.status,
    d.note || null,
    req.user.id,
    now
  );
  writeAuditLog(req.user.id, 'team_attendance_recorded', 'attendance', d.employee_id, { work_date: d.work_date });
  res
    .status(201)
    .json(db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?').get(d.employee_id, d.work_date));
});

router.delete('/attendance/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(
      `SELECT a.* FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.id = ? AND e.managed_by = ?`
    )
    .get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Record not found' });
  db.prepare('DELETE FROM attendance WHERE id = ?').run(id);
  writeAuditLog(req.user.id, 'team_attendance_deleted', 'attendance', row.employee_id, { work_date: row.work_date });
  res.json({ ok: true });
});

// Removes the whole day's register for her team (e.g. a day recorded by mistake).
router.delete('/attendance', (req, res) => {
  const date = req.query.date;
  if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'Pick a date' });
  const info = db
    .prepare(
      `DELETE FROM attendance WHERE work_date = ?
         AND employee_id IN (SELECT id FROM employees WHERE managed_by = ?)`
    )
    .run(date, req.user.id);
  writeAuditLog(req.user.id, 'team_attendance_day_deleted', 'attendance', null, { work_date: date, removed: info.changes });
  res.json({ ok: true, removed: info.changes });
});

// ---------------------------------------------------------------------------
// Leave - the team member tells her, she records it (no approval step).
// ---------------------------------------------------------------------------

router.get('/leave', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT lr.id, lr.employee_id, lr.type, lr.start_date, lr.end_date, lr.reason, lr.created_at,
                e.full_name AS employee_name
         FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
         WHERE e.managed_by = ?
         ORDER BY lr.start_date DESC, lr.id DESC`
      )
      .all(req.user.id)
  );
});

const leaveSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  type: z.enum(['annual', 'sick', 'unpaid', 'other']),
  start_date: teamDate,
  end_date: teamDate,
  reason: z.string().optional().nullable(),
});

router.post('/leave', (req, res) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  if (d.end_date < d.start_date) return res.status(400).json({ error: 'End date must be on or after the start date' });
  if (!ownMember(req, d.employee_id)) return res.status(404).json({ error: 'Team member not found' });

  const info = db
    .prepare(
      `INSERT INTO leave_requests (employee_id, type, start_date, end_date, reason, status, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, 'approved', ?, datetime('now'))`
    )
    .run(d.employee_id, d.type, d.start_date, d.end_date, d.reason || null, req.user.id);
  writeAuditLog(req.user.id, 'team_leave_recorded', 'leave_request', info.lastInsertRowid, { employeeId: d.employee_id });
  res.status(201).json({ id: info.lastInsertRowid });
});

router.delete('/leave/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(
      `SELECT lr.id, lr.employee_id FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
       WHERE lr.id = ? AND e.managed_by = ?`
    )
    .get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Leave record not found' });
  db.prepare('DELETE FROM leave_requests WHERE id = ?').run(id);
  writeAuditLog(req.user.id, 'team_leave_deleted', 'leave_request', id, { employeeId: row.employee_id });
  res.json({ ok: true });
});

module.exports = router;

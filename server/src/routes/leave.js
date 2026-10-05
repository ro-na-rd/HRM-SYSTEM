const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');
const { notifyStaff, notifyEmployee } = require('../lib/notify');
const { findOrCreateOwnEmployeeId } = require('../lib/selfService');

const router = express.Router();

router.use(requireAuth);

function findOwnEmployeeId(userId) {
  return findOrCreateOwnEmployeeId(userId);
}

// Admin/HR see everyone's requests. Employees see only their own.
router.get('/', (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const rows = db
      .prepare(
        `SELECT lr.*, e.full_name AS employee_name, r.name AS reviewed_by_name
         FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
                                 LEFT JOIN users r ON r.id = lr.reviewed_by
         WHERE e.managed_by IS NULL
         ORDER BY lr.created_at DESC`
      )
      .all();
    return res.json(rows);
  }

  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) return res.json([]);
  const rows = db
    .prepare(
      `SELECT lr.*, r.name AS reviewed_by_name
       FROM leave_requests lr LEFT JOIN users r ON r.id = lr.reviewed_by
       WHERE lr.employee_id = ? ORDER BY lr.created_at DESC`
    )
    .all(employeeId);
  res.json(rows);
});

const leaveSchema = z.object({
  type: z.enum(['annual', 'sick', 'unpaid', 'other']),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  reason: z.string().optional().nullable(),
});

router.post('/', (req, res) => {
  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) {
    return res
      .status(400)
      .json({ error: 'Your login isn’t linked to an employee record yet. Ask your Admin to link it in Employees.' });
  }

  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  if (d.end_date < d.start_date) {
    return res.status(400).json({ error: 'End date must be on or after the start date' });
  }

  const info = db
    .prepare(
      `INSERT INTO leave_requests (employee_id, type, start_date, end_date, reason)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(employeeId, d.type, d.start_date, d.end_date, d.reason ?? null);

  writeAuditLog(req.user.id, 'leave_requested', 'leave_request', info.lastInsertRowid, { type: d.type });

  const emp = db.prepare('SELECT full_name FROM employees WHERE id = ?').get(employeeId);
  notifyStaff(
    {
      type: 'leave_request',
      title: 'New leave request',
      body: `${emp.full_name} requested ${d.type} leave (${d.start_date} → ${d.end_date})`,
      link: '/leave-management',
    },
    req.user.id
  );

  res.status(201).json(db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(info.lastInsertRowid));
});

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  review_note: z.string().optional().nullable(),
});

router.patch('/:id/status', requireRole('admin', 'hr'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(
    'SELECT lr.* FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id WHERE lr.id = ? AND e.managed_by IS NULL'
  ).get(id);
  if (!existing) return res.status(404).json({ error: 'Leave request not found' });

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  db.prepare(
    `UPDATE leave_requests SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`
  ).run(d.status, d.review_note ?? null, req.user.id, id);

  writeAuditLog(req.user.id, d.status === 'approved' ? 'leave_approved' : 'leave_rejected', 'leave_request', id);

  notifyEmployee(existing.employee_id, {
    type: `leave_${d.status}`,
    title: `Leave request ${d.status}`,
    body:
      d.review_note ||
      `Your ${existing.type} leave (${existing.start_date} → ${existing.end_date}) was ${d.status}.`,
    link: '/profile/leave',
  });

  res.json(db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id));
});

module.exports = router;

const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

function findOwnEmployeeId(userId) {
  const employee = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(userId);
  return employee ? employee.id : null;
}

// Admin/HR see everyone's letters. Employees see only their own.
router.get('/', (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const rows = db
      .prepare(
        `SELECT l.*, e.full_name AS employee_name
         FROM letters l JOIN employees e ON e.id = l.employee_id
         ORDER BY l.created_at DESC`
      )
      .all();
    return res.json(rows);
  }

  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) return res.json([]);
  const rows = db.prepare('SELECT * FROM letters WHERE employee_id = ? ORDER BY created_at DESC').all(employeeId);
  res.json(rows);
});

const letterSchema = z.object({
  direction: z.enum(['request', 'to_hr']),
  subject: z.string().min(1),
  message: z.string().optional().nullable(),
});

router.post('/', (req, res) => {
  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) {
    return res
      .status(400)
      .json({ error: 'Your login isn’t linked to an employee record yet. Ask your Admin to link it in Employees.' });
  }

  const parsed = letterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const info = db
    .prepare(`INSERT INTO letters (employee_id, direction, subject, message) VALUES (?, ?, ?, ?)`)
    .run(employeeId, d.direction, d.subject, d.message ?? null);

  writeAuditLog(req.user.id, 'letter_submitted', 'letter', info.lastInsertRowid, { direction: d.direction });
  res.status(201).json(db.prepare('SELECT * FROM letters WHERE id = ?').get(info.lastInsertRowid));
});

const resolveSchema = z.object({
  response: z.string().min(1, 'A response is required to resolve this'),
});

router.patch('/:id/resolve', requireRole('admin', 'hr'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Letter not found' });

  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  db.prepare(
    `UPDATE letters SET status = 'resolved', response = ?, resolved_by = ?, resolved_at = datetime('now')
     WHERE id = ?`
  ).run(parsed.data.response, req.user.id, id);

  writeAuditLog(req.user.id, 'letter_resolved', 'letter', id);
  res.json(db.prepare('SELECT * FROM letters WHERE id = ?').get(id));
});

module.exports = router;

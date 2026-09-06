const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

// Admin/HR see the full roster. Employees may only see their own linked record.
router.get('/', (req, res) => {
  if (req.user.role === 'employee') {
    const own = db.prepare('SELECT * FROM employees WHERE user_id = ?').all(req.user.id);
    return res.json(own);
  }
  const employees = db.prepare('SELECT * FROM employees ORDER BY full_name ASC').all();
  res.json(employees);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const employee = db
    .prepare(
      `SELECT e.*, u.name AS linked_user_name, u.email AS linked_user_email
       FROM employees e LEFT JOIN users u ON u.id = e.user_id
       WHERE e.id = ?`
    )
    .get(id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  if (req.user.role === 'employee' && employee.user_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not have permission to view this record' });
  }
  res.json(employee);
});

const employeeSchema = z.object({
  full_name: z.string().min(1),
  department: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  hire_date: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  user_id: z.number().int().optional().nullable(),
});

router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const info = db
    .prepare(
      `INSERT INTO employees (full_name, department, position, hire_date, phone, notes, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(d.full_name, d.department ?? null, d.position ?? null, d.hire_date ?? null, d.phone ?? null, d.notes ?? null, d.user_id ?? null);

  writeAuditLog(req.user.id, 'employee_created', 'employee', info.lastInsertRowid);
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(employee);
});

router.patch('/:id', requireRole('admin', 'hr'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const merged = { ...existing, ...d };
  db.prepare(
    `UPDATE employees SET full_name = ?, department = ?, position = ?, hire_date = ?, phone = ?, notes = ?, user_id = ?
     WHERE id = ?`
  ).run(merged.full_name, merged.department, merged.position, merged.hire_date, merged.phone, merged.notes, merged.user_id, id);

  writeAuditLog(req.user.id, 'employee_updated', 'employee', id, { fields: Object.keys(d) });
  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(id));
});

router.patch('/:id/status', requireRole('admin', 'hr'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const active = req.body.active ? 1 : 0;
  db.prepare('UPDATE employees SET active = ? WHERE id = ?').run(active, id);
  writeAuditLog(req.user.id, active ? 'employee_reactivated' : 'employee_deactivated', 'employee', id);
  res.json({ ok: true, active });
});

module.exports = router;

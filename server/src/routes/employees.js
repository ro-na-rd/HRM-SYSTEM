const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { encryptBuffer, decryptBuffer } = require('../lib/crypto');
const { writeAuditLog } = require('../lib/audit');

const router = express.Router();
const storageDir = path.join(__dirname, '..', '..', 'storage');

const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, plenty for a profile photo
});
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

router.use(requireAuth);

// Columns safe to send to the client - never the stored filename, IV, or
// auth tag for the photo (internal storage details, not needed by the UI).
// has_photo lets the frontend know whether to request /:id/photo at all.
const SAFE_COLUMNS = `id, full_name, department, position, hire_date, phone, notes, user_id, active, created_at,
  (photo_stored_filename IS NOT NULL) AS has_photo`;

function findOwnEmployeeId(userId) {
  const employee = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(userId);
  return employee ? employee.id : null;
}

// Admin/HR see the full roster. Employees may only see their own linked record.
router.get('/', (req, res) => {
  if (req.user.role === 'employee') {
    const own = db.prepare(`SELECT ${SAFE_COLUMNS} FROM employees WHERE user_id = ?`).all(req.user.id);
    return res.json(own);
  }
  const employees = db.prepare(`SELECT ${SAFE_COLUMNS} FROM employees ORDER BY full_name ASC`).all();
  res.json(employees);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const employee = db
    .prepare(
      `SELECT e.id, e.full_name, e.department, e.position, e.hire_date, e.phone, e.notes, e.user_id, e.active,
              e.created_at, (e.photo_stored_filename IS NOT NULL) AS has_photo,
              u.name AS linked_user_name, u.email AS linked_user_email
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

// Employee self-service: they may update their own phone number only.
// Everything else (name, department, position, hire date, notes, linked
// login) stays an official record that only Admin/HR can change.
// This must be registered before the '/:id' routes below, otherwise
// Express would match "me" as an :id value instead.
const selfUpdateSchema = z.object({
  phone: z.string().optional().nullable(),
});

router.patch('/me', (req, res) => {
  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) {
    return res
      .status(400)
      .json({ error: 'Your login isn’t linked to an employee record yet. Ask your Admin to link it in Employees.' });
  }

  const parsed = selfUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  db.prepare('UPDATE employees SET phone = ? WHERE id = ?').run(parsed.data.phone ?? null, employeeId);
  writeAuditLog(req.user.id, 'employee_self_updated', 'employee', employeeId, { fields: ['phone'] });
  res.json(db.prepare(`SELECT ${SAFE_COLUMNS} FROM employees WHERE id = ?`).get(employeeId));
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
  const employee = db.prepare(`SELECT ${SAFE_COLUMNS} FROM employees WHERE id = ?`).get(info.lastInsertRowid);
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
  res.json(db.prepare(`SELECT ${SAFE_COLUMNS} FROM employees WHERE id = ?`).get(id));
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

function canManagePhoto(req, employeeId) {
  if (req.user.role === 'admin' || req.user.role === 'hr') return true;
  return findOwnEmployeeId(req.user.id) === employeeId;
}

// Admin/HR can set any employee's photo; an Employee can only set their own.
router.post('/:id/photo', uploadPhoto.single('photo'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  if (!canManagePhoto(req, id)) {
    return res.status(403).json({ error: 'You do not have permission to change this photo' });
  }
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
  if (!ALLOWED_PHOTO_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Photo must be a JPEG, PNG, WEBP, or GIF image' });
  }

  if (existing.photo_stored_filename) {
    const oldPath = path.join(storageDir, existing.photo_stored_filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const { ciphertext, iv, authTag } = encryptBuffer(req.file.buffer);
  const storedFilename = crypto.randomUUID();
  fs.writeFileSync(path.join(storageDir, storedFilename), ciphertext);

  db.prepare(
    `UPDATE employees SET photo_stored_filename = ?, photo_mime_type = ?, photo_iv = ?, photo_auth_tag = ? WHERE id = ?`
  ).run(storedFilename, req.file.mimetype, iv, authTag, id);

  writeAuditLog(req.user.id, 'employee_photo_updated', 'employee', id);
  res.json({ ok: true, has_photo: true });
});

router.get('/:id/photo', (req, res) => {
  const id = Number(req.params.id);
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!employee || !employee.photo_stored_filename) return res.status(404).end();

  if (req.user.role === 'employee' && employee.user_id !== req.user.id) {
    return res.status(403).end();
  }

  const ciphertext = fs.readFileSync(path.join(storageDir, employee.photo_stored_filename));
  const plain = decryptBuffer(ciphertext, employee.photo_iv, employee.photo_auth_tag);
  res.setHeader('Content-Type', employee.photo_mime_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(plain);
});

router.delete('/:id/photo', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  if (!canManagePhoto(req, id)) {
    return res.status(403).json({ error: 'You do not have permission to change this photo' });
  }

  if (existing.photo_stored_filename) {
    const oldPath = path.join(storageDir, existing.photo_stored_filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  db.prepare(
    `UPDATE employees SET photo_stored_filename = NULL, photo_mime_type = NULL, photo_iv = NULL, photo_auth_tag = NULL WHERE id = ?`
  ).run(id);

  writeAuditLog(req.user.id, 'employee_photo_removed', 'employee', id);
  res.json({ ok: true, has_photo: false });
});

module.exports = router;

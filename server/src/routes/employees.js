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
const { findOrCreateOwnEmployeeId } = require('../lib/selfService');

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
const SAFE_COLUMNS = `id, full_name, department, position, hire_date, phone, notes, user_id, manager_id, active,
  created_at, date_of_birth, gender, address, emergency_contact_name, emergency_contact_relationship,
  emergency_contact_phone, (photo_stored_filename IS NOT NULL) AS has_photo`;
const SAFE_COLUMNS_PREFIXED = `e.id, e.full_name, e.department, e.position, e.hire_date, e.phone, e.notes, e.user_id,
  e.manager_id, e.active, e.created_at, e.date_of_birth, e.gender, e.address, e.emergency_contact_name,
  e.emergency_contact_relationship, e.emergency_contact_phone,
  (e.photo_stored_filename IS NOT NULL) AS has_photo, m.full_name AS manager_name`;

function findOwnEmployeeId(userId) {
  return findOrCreateOwnEmployeeId(userId);
}

// Admin/HR see the full roster. Employees may only see their own record -
// auto-created on first use if HR hasn't linked them yet.
router.get('/', (req, res) => {
  if (req.user.role === 'employee') {
    findOrCreateOwnEmployeeId(req.user.id);
    const own = db
      .prepare(
        `SELECT ${SAFE_COLUMNS_PREFIXED} FROM employees e LEFT JOIN employees m ON m.id = e.manager_id
         WHERE e.user_id = ?`
      )
      .all(req.user.id);
    return res.json(own);
  }
  const employees = db
    .prepare(
      `SELECT ${SAFE_COLUMNS_PREFIXED} FROM employees e LEFT JOIN employees m ON m.id = e.manager_id
       ORDER BY e.full_name ASC`
    )
    .all();
  res.json(employees);
});

// Distinct departments and positions already in use, to populate the
// dropdowns on the add/edit employee forms. Must stay above '/:id' so
// Express doesn't treat "meta" as an :id.
router.get('/meta', requireRole('admin', 'hr'), (req, res) => {
  const distinct = (column) =>
    db
      .prepare(
        `SELECT DISTINCT ${column} AS v FROM employees
         WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''
         ORDER BY ${column} COLLATE NOCASE`
      )
      .all()
      .map((r) => r.v);

  // Which positions have actually been used with which department, so the
  // Position dropdown can stay scoped to the chosen department.
  const positionsByDepartment = {};
  db.prepare(
    `SELECT DISTINCT department AS d, position AS p FROM employees
     WHERE department IS NOT NULL AND TRIM(department) <> ''
       AND position IS NOT NULL AND TRIM(position) <> ''
     ORDER BY position COLLATE NOCASE`
  )
    .all()
    .forEach(({ d, p }) => {
      (positionsByDepartment[d] = positionsByDepartment[d] || []).push(p);
    });

  res.json({ departments: distinct('department'), positions: distinct('position'), positionsByDepartment });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const employee = db
    .prepare(
      `SELECT e.id, e.full_name, e.department, e.position, e.hire_date, e.phone, e.notes, e.user_id, e.manager_id,
              e.active, e.created_at, e.date_of_birth, e.gender, e.address, e.emergency_contact_name,
              e.emergency_contact_relationship, e.emergency_contact_phone,
              (e.photo_stored_filename IS NOT NULL) AS has_photo,
              u.name AS linked_user_name, u.email AS linked_user_email,
              m.full_name AS manager_name
       FROM employees e LEFT JOIN users u ON u.id = e.user_id
                         LEFT JOIN employees m ON m.id = e.manager_id
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
  manager_id: z.number().int().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_relationship: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
});

// Walks up the proposed manager chain to make sure assigning managerId to
// employeeId would not create a reporting loop (A manages B who manages A).
function wouldCreateManagerCycle(employeeId, managerId) {
  if (managerId === employeeId) return true;
  let current = managerId;
  const seen = new Set();
  while (current != null) {
    if (current === employeeId) return true;
    if (seen.has(current)) break; // already-broken cycle elsewhere; don't loop forever
    seen.add(current);
    const row = db.prepare('SELECT manager_id FROM employees WHERE id = ?').get(current);
    current = row ? row.manager_id : null;
  }
  return false;
}

// Employee self-service: personal info only (phone, DOB, gender, address,
// emergency contact). Employment info (name, department, position, hire
// date, manager, notes, linked login) stays an official record that only
// Admin/HR can change.
// This must be registered before the '/:id' routes below, otherwise
// Express would match "me" as an :id value instead.
const selfUpdateSchema = z.object({
  phone: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_relationship: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
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
  const d = parsed.data;

  db.prepare(
    `UPDATE employees SET phone = ?, date_of_birth = ?, gender = ?, address = ?,
       emergency_contact_name = ?, emergency_contact_relationship = ?, emergency_contact_phone = ?
     WHERE id = ?`
  ).run(
    d.phone ?? null,
    d.date_of_birth ?? null,
    d.gender ?? null,
    d.address ?? null,
    d.emergency_contact_name ?? null,
    d.emergency_contact_relationship ?? null,
    d.emergency_contact_phone ?? null,
    employeeId
  );
  writeAuditLog(req.user.id, 'employee_self_updated', 'employee', employeeId, { fields: Object.keys(d) });
  res.json(db.prepare(`SELECT ${SAFE_COLUMNS} FROM employees WHERE id = ?`).get(employeeId));
});

router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const info = db
    .prepare(
      `INSERT INTO employees (full_name, department, position, hire_date, phone, notes, user_id, manager_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      d.full_name,
      d.department ?? null,
      d.position ?? null,
      d.hire_date ?? null,
      d.phone ?? null,
      d.notes ?? null,
      d.user_id ?? null,
      d.manager_id ?? null
    );

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

  if (merged.manager_id != null && wouldCreateManagerCycle(id, merged.manager_id)) {
    return res.status(400).json({ error: 'That would create a reporting loop - choose a different manager' });
  }

  db.prepare(
    `UPDATE employees SET full_name = ?, department = ?, position = ?, hire_date = ?, phone = ?, notes = ?, user_id = ?,
       manager_id = ?, date_of_birth = ?, gender = ?, address = ?, emergency_contact_name = ?,
       emergency_contact_relationship = ?, emergency_contact_phone = ?
     WHERE id = ?`
  ).run(
    merged.full_name,
    merged.department,
    merged.position,
    merged.hire_date,
    merged.phone,
    merged.notes,
    merged.user_id,
    merged.manager_id,
    merged.date_of_birth,
    merged.gender,
    merged.address,
    merged.emergency_contact_name,
    merged.emergency_contact_relationship,
    merged.emergency_contact_phone,
    id
  );

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

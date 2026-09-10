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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per payslip file
});

router.use(requireAuth);

function findOwnEmployeeId(userId) {
  const employee = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(userId);
  return employee ? employee.id : null;
}

function isStaff(req) {
  return req.user.role === 'admin' || req.user.role === 'hr';
}

// An empty string from a form field should mean "not given", not 0.
const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().nonnegative().optional()
);

// ---------------------------------------------------------------------------
// Compensation — one current-salary row per employee. HR writes, employee reads.
// ---------------------------------------------------------------------------

// HR: every active employee alongside their salary (null where not set yet).
router.get('/compensation', requireRole('admin', 'hr'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.id AS employee_id, e.full_name, e.department, e.position,
              c.currency, c.gross_salary, c.pay_frequency, c.effective_date, c.note, c.updated_at
       FROM employees e
       LEFT JOIN compensation c ON c.employee_id = e.id
       WHERE e.active = 1
       ORDER BY e.full_name ASC`
    )
    .all();
  res.json(rows);
});

// Employee: their own salary details, or null if HR hasn't entered them.
router.get('/compensation/mine', (req, res) => {
  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) return res.json(null);
  res.json(db.prepare('SELECT * FROM compensation WHERE employee_id = ?').get(employeeId) || null);
});

const compensationSchema = z.object({
  currency: z.string().trim().min(1).max(8).default('RWF'),
  gross_salary: optionalNumber,
  pay_frequency: z.enum(['monthly', 'biweekly', 'weekly']).default('monthly'),
  effective_date: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

router.patch('/compensation/:employeeId', requireRole('admin', 'hr'), (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const parsed = compensationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  db.prepare(
    `INSERT INTO compensation (employee_id, currency, gross_salary, pay_frequency, effective_date, note, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(employee_id) DO UPDATE SET
       currency = excluded.currency,
       gross_salary = excluded.gross_salary,
       pay_frequency = excluded.pay_frequency,
       effective_date = excluded.effective_date,
       note = excluded.note,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`
  ).run(
    employeeId,
    d.currency,
    d.gross_salary ?? null,
    d.pay_frequency,
    d.effective_date || null,
    d.note || null,
    req.user.id
  );

  writeAuditLog(req.user.id, 'compensation_updated', 'employee', employeeId);
  res.json(db.prepare('SELECT * FROM compensation WHERE employee_id = ?').get(employeeId));
});

// ---------------------------------------------------------------------------
// Payslips — one row per employee per pay period.
// ---------------------------------------------------------------------------

// HR sees every payslip; an employee sees only their own.
router.get('/payslips', (req, res) => {
  if (isStaff(req)) {
    const rows = db
      .prepare(
        `SELECT p.id, p.employee_id, e.full_name AS employee_name, p.period_month, p.currency,
                p.gross_pay, p.deductions, p.net_pay, p.deductions_note, p.note,
                p.file_original_filename, p.created_at
         FROM payslips p JOIN employees e ON e.id = p.employee_id
         ORDER BY p.period_month DESC, e.full_name ASC`
      )
      .all();
    return res.json(rows);
  }

  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) return res.json([]);
  const rows = db
    .prepare(
      `SELECT id, employee_id, period_month, currency, gross_pay, deductions, net_pay,
              deductions_note, note, file_original_filename, created_at
       FROM payslips WHERE employee_id = ? ORDER BY period_month DESC`
    )
    .all(employeeId);
  res.json(rows);
});

const payslipSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  period_month: z.string().regex(/^\d{4}-\d{2}$/, 'Pay period must be a month (YYYY-MM)'),
  currency: z.string().trim().min(1).max(8).default('RWF'),
  gross_pay: z.coerce.number().nonnegative(),
  deductions: z.preprocess((v) => (v === '' || v == null ? 0 : v), z.coerce.number().nonnegative()),
  net_pay: optionalNumber,
  deductions_note: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

router.post('/payslips', requireRole('admin', 'hr'), upload.single('file'), (req, res) => {
  const parsed = payslipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(d.employee_id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const netPay = d.net_pay ?? Math.max(0, d.gross_pay - d.deductions);

  let stored = null;
  let iv = null;
  let authTag = null;
  if (req.file) {
    const enc = encryptBuffer(req.file.buffer);
    stored = crypto.randomUUID();
    iv = enc.iv;
    authTag = enc.authTag;
    fs.writeFileSync(path.join(storageDir, stored), enc.ciphertext);
  }

  let info;
  try {
    info = db
      .prepare(
        `INSERT INTO payslips
           (employee_id, period_month, currency, gross_pay, deductions, net_pay, deductions_note, note,
            file_original_filename, file_stored_filename, file_mime_type, file_size, file_iv, file_auth_tag, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        d.employee_id,
        d.period_month,
        d.currency,
        d.gross_pay,
        d.deductions,
        netPay,
        d.deductions_note || null,
        d.note || null,
        req.file ? req.file.originalname : null,
        stored,
        req.file ? req.file.mimetype : null,
        req.file ? req.file.size : null,
        iv,
        authTag,
        req.user.id
      );
  } catch (err) {
    if (stored) {
      const p = path.join(storageDir, stored);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'A payslip for that month already exists for this employee.' });
    }
    throw err;
  }

  writeAuditLog(req.user.id, 'payslip_created', 'payslip', info.lastInsertRowid, {
    employeeId: d.employee_id,
    period: d.period_month,
  });
  res.status(201).json(db.prepare('SELECT * FROM payslips WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/payslips/:id', requireRole('admin', 'hr'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM payslips WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Payslip not found' });

  if (row.file_stored_filename) {
    const p = path.join(storageDir, row.file_stored_filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.prepare('DELETE FROM payslips WHERE id = ?').run(id);
  writeAuditLog(req.user.id, 'payslip_deleted', 'payslip', id, { employeeId: row.employee_id });
  res.json({ ok: true });
});

// Stream the attached payslip file. HR can open any; an employee only their own.
router.get('/payslips/:id/file', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM payslips WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Payslip not found' });
  if (!isStaff(req) && findOwnEmployeeId(req.user.id) !== row.employee_id) {
    return res.status(403).json({ error: 'You do not have permission to view this payslip' });
  }
  if (!row.file_stored_filename) return res.status(404).json({ error: 'This payslip has no attached file' });

  const ciphertext = fs.readFileSync(path.join(storageDir, row.file_stored_filename));
  const plain = decryptBuffer(ciphertext, row.file_iv, row.file_auth_tag);

  writeAuditLog(req.user.id, 'payslip_downloaded', 'payslip', id, { employeeId: row.employee_id });
  res.setHeader('Content-Type', row.file_mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_original_filename)}"`);
  res.send(plain);
});

module.exports = router;

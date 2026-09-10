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
const { notifyStaff, notifyEmployee } = require('../lib/notify');

const router = express.Router();
const storageDir = path.join(__dirname, '..', '..', 'storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB, same cap as regular documents
});

router.use(requireAuth);

function findOwnEmployeeId(userId) {
  const employee = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(userId);
  return employee ? employee.id : null;
}

// Columns safe to send to the client - never the stored filename, IV, or
// auth tag for the attachment (internal storage details, not needed by the UI).
const SAFE_COLUMNS = `id, employee_id, direction, subject, message, status, response, resolved_by, created_at,
  resolved_at, attachment_original_filename, attachment_mime_type, attachment_size`;
const SAFE_COLUMNS_PREFIXED = `l.id, l.employee_id, l.direction, l.subject, l.message, l.status, l.response,
  l.resolved_by, l.created_at, l.resolved_at, l.attachment_original_filename, l.attachment_mime_type, l.attachment_size`;

// Admin/HR see everyone's letters. Employees see only their own.
router.get('/', (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'hr') {
    const rows = db
      .prepare(
        `SELECT ${SAFE_COLUMNS_PREFIXED}, e.full_name AS employee_name
         FROM letters l JOIN employees e ON e.id = l.employee_id
         ORDER BY l.created_at DESC`
      )
      .all();
    return res.json(rows);
  }

  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) return res.json([]);
  const rows = db
    .prepare(`SELECT ${SAFE_COLUMNS} FROM letters WHERE employee_id = ? ORDER BY created_at DESC`)
    .all(employeeId);
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

  const emp = db.prepare('SELECT full_name FROM employees WHERE id = ?').get(employeeId);
  notifyStaff(
    { type: 'letter', title: 'New letter from an employee', body: `${emp.full_name}: ${d.subject}`, link: '/leave-management' },
    req.user.id
  );

  res.status(201).json(db.prepare(`SELECT ${SAFE_COLUMNS} FROM letters WHERE id = ?`).get(info.lastInsertRowid));
});

// Resolving accepts multipart form data so HR can optionally attach the
// actual letter file (e.g. an employment confirmation PDF) alongside their
// written response. The attachment is encrypted at rest exactly like
// regular documents, but it's stored on the letter itself, not in the
// Documents system - employees still have zero access to Documents; this
// is a narrow, deliberate exception so an employee can retrieve ONLY the
// specific letter that was prepared for their own request.
router.patch('/:id/resolve', requireRole('admin', 'hr'), upload.single('attachment'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Letter not found' });

  const response = (req.body.response || '').trim();
  if (!response) return res.status(400).json({ error: 'A response is required to resolve this' });

  let attachmentFields = {
    attachment_original_filename: existing.attachment_original_filename,
    attachment_stored_filename: existing.attachment_stored_filename,
    attachment_mime_type: existing.attachment_mime_type,
    attachment_size: existing.attachment_size,
    attachment_iv: existing.attachment_iv,
    attachment_auth_tag: existing.attachment_auth_tag,
  };

  if (req.file) {
    // Replace any previous attachment on this letter.
    if (existing.attachment_stored_filename) {
      const oldPath = path.join(storageDir, existing.attachment_stored_filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const { ciphertext, iv, authTag } = encryptBuffer(req.file.buffer);
    const storedFilename = crypto.randomUUID();
    fs.writeFileSync(path.join(storageDir, storedFilename), ciphertext);
    attachmentFields = {
      attachment_original_filename: req.file.originalname,
      attachment_stored_filename: storedFilename,
      attachment_mime_type: req.file.mimetype,
      attachment_size: req.file.size,
      attachment_iv: iv,
      attachment_auth_tag: authTag,
    };
  }

  db.prepare(
    `UPDATE letters SET status = 'resolved', response = ?, resolved_by = ?, resolved_at = datetime('now'),
       attachment_original_filename = ?, attachment_stored_filename = ?, attachment_mime_type = ?,
       attachment_size = ?, attachment_iv = ?, attachment_auth_tag = ?
     WHERE id = ?`
  ).run(
    response,
    req.user.id,
    attachmentFields.attachment_original_filename,
    attachmentFields.attachment_stored_filename,
    attachmentFields.attachment_mime_type,
    attachmentFields.attachment_size,
    attachmentFields.attachment_iv,
    attachmentFields.attachment_auth_tag,
    id
  );

  writeAuditLog(req.user.id, 'letter_resolved', 'letter', id, { attached: !!req.file });

  notifyEmployee(existing.employee_id, {
    type: 'letter_resolved',
    title: 'HR responded to your letter',
    body: existing.subject,
    link: '/profile/letters',
  });

  res.json(db.prepare(`SELECT ${SAFE_COLUMNS} FROM letters WHERE id = ?`).get(id));
});

// Download the attachment on one letter. Admin/HR can download any;
// an employee can download ONLY the attachment on their own letter -
// this is not general Documents access.
router.get('/:id/attachment', (req, res) => {
  const id = Number(req.params.id);
  const letter = db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  if (!letter || !letter.attachment_stored_filename) {
    return res.status(404).json({ error: 'No attachment on this letter' });
  }

  if (req.user.role === 'employee') {
    const employeeId = findOwnEmployeeId(req.user.id);
    if (!employeeId || letter.employee_id !== employeeId) {
      return res.status(403).json({ error: 'You do not have permission to view this' });
    }
  }

  const ciphertext = fs.readFileSync(path.join(storageDir, letter.attachment_stored_filename));
  const plain = decryptBuffer(ciphertext, letter.attachment_iv, letter.attachment_auth_tag);

  writeAuditLog(req.user.id, 'letter_attachment_downloaded', 'letter', id);

  res.setHeader('Content-Type', letter.attachment_mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(letter.attachment_original_filename)}"`);
  res.send(plain);
});

module.exports = router;

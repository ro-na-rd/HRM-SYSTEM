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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per document
});

const CATEGORIES = ['contract', 'id_document', 'letter', 'certificate', 'other'];

// Every document route is Admin/HR only — employees never reach this router.
router.use(requireAuth, requireRole('admin', 'hr'));

// Company-wide document list (all employees), for the top-level Documents page.
router.get('/', (req, res) => {
  const docs = db
    .prepare(
      `SELECT d.id, d.employee_id, e.full_name AS employee_name, d.category, d.original_filename,
              d.mime_type, d.size, d.created_at
       FROM documents d
       JOIN employees e ON e.id = d.employee_id
       ORDER BY d.created_at DESC`
    )
    .all();
  res.json(docs);
});

router.get('/employee/:employeeId', (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const docs = db
    .prepare(
      `SELECT id, employee_id, uploaded_by, category, original_filename, mime_type, size, created_at
       FROM documents WHERE employee_id = ? ORDER BY created_at DESC`
    )
    .all(employeeId);
  res.json(docs);
});

router.post('/employee/:employeeId', upload.single('file'), (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const category = req.body.category;
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Category must be one of: ${CATEGORIES.join(', ')}` });
  }

  const { ciphertext, iv, authTag } = encryptBuffer(req.file.buffer);
  const storedFilename = crypto.randomUUID();
  fs.writeFileSync(path.join(storageDir, storedFilename), ciphertext);

  const info = db
    .prepare(
      `INSERT INTO documents (employee_id, uploaded_by, category, original_filename, stored_filename, mime_type, size, iv, auth_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      employeeId,
      req.user.id,
      category,
      req.file.originalname,
      storedFilename,
      req.file.mimetype,
      req.file.size,
      iv,
      authTag
    );

  writeAuditLog(req.user.id, 'document_uploaded', 'document', info.lastInsertRowid, {
    employeeId,
    category,
    filename: req.file.originalname,
  });

  res.status(201).json({
    id: info.lastInsertRowid,
    employee_id: employeeId,
    category,
    original_filename: req.file.originalname,
    mime_type: req.file.mimetype,
    size: req.file.size,
  });
});

router.get('/:id/download', (req, res) => {
  const id = Number(req.params.id);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const ciphertext = fs.readFileSync(path.join(storageDir, doc.stored_filename));
  const plain = decryptBuffer(ciphertext, doc.iv, doc.auth_tag);

  writeAuditLog(req.user.id, 'document_downloaded', 'document', id, { employeeId: doc.employee_id });

  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.original_filename)}"`);
  res.send(plain);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const filePath = path.join(storageDir, doc.stored_filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);

  writeAuditLog(req.user.id, 'document_deleted', 'document', id, { employeeId: doc.employee_id });
  res.json({ ok: true });
});

module.exports = router;

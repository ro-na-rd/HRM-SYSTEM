const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { encryptBuffer, decryptBuffer } = require('../lib/crypto');
const { writeAuditLog } = require('../lib/audit');
const { notifyEmployee } = require('../lib/notify');
const { findOrCreateOwnEmployeeId } = require('../lib/selfService');

const router = express.Router();
const storageDir = path.join(__dirname, '..', '..', 'storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per document
});

const CATEGORIES = ['contract', 'id_document', 'letter', 'certificate', 'other'];

// Categories an employee may upload for themselves - things they'd submit
// (an ID scan, a certificate). Contracts and letters are HR-issued records,
// so only Admin/HR can add those, even to an employee's own file.
const EMPLOYEE_UPLOADABLE_CATEGORIES = ['id_document', 'certificate', 'other'];

router.use(requireAuth);

function findOwnEmployeeId(userId) {
  return findOrCreateOwnEmployeeId(userId);
}

function isStaff(req) {
  return req.user.role === 'admin' || req.user.role === 'hr';
}

// Every document (all employees' files plus company documents) - Admin/HR
// only. Company documents have employee_id/employee_name = null.
router.get('/', requireRole('admin', 'hr'), (req, res) => {
  const docs = db
    .prepare(
      `SELECT d.id, d.employee_id, e.full_name AS employee_name, d.category, d.original_filename,
              d.mime_type, d.size, d.created_at
       FROM documents d
       LEFT JOIN employees e ON e.id = d.employee_id
       ORDER BY d.created_at DESC`
    )
    .all();
  res.json(docs);
});

// Admin/HR can see any employee's documents; an employee can only see their own.
router.get('/employee/:employeeId', (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!isStaff(req) && findOwnEmployeeId(req.user.id) !== employeeId) {
    return res.status(403).json({ error: 'You do not have permission to view these documents' });
  }
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
  const employee = db.prepare('SELECT id FROM employees WHERE id = ? AND managed_by IS NULL').get(employeeId);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const staff = isStaff(req);
  if (!staff && findOwnEmployeeId(req.user.id) !== employeeId) {
    return res.status(403).json({ error: 'You do not have permission to upload here' });
  }

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const category = req.body.category;
  const allowedCategories = staff ? CATEGORIES : EMPLOYEE_UPLOADABLE_CATEGORIES;
  if (!allowedCategories.includes(category)) {
    return res.status(400).json({
      error: staff
        ? `Category must be one of: ${CATEGORIES.join(', ')}`
        : `You can only upload: ${EMPLOYEE_UPLOADABLE_CATEGORIES.join(', ')}. Ask HR to add a ${category}.`,
    });
  }

  const created = storeDocument(req, employeeId, category);

  // Only tell the employee when HR/Admin added something to their file -
  // not when the employee uploaded it themselves.
  if (staff) {
    notifyEmployee(employeeId, {
      type: 'document',
      title: 'A document was added to your file',
      body: req.file.originalname,
      link: '/profile/documents',
    });
  }

  res.status(201).json(created);
});

// Company document: filed by HR/Admin without choosing an employee. Not in
// anyone's file, so no employee can see it and nobody is notified.
router.post('/company', requireRole('admin', 'hr'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const category = req.body.category;
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Category must be one of: ${CATEGORIES.join(', ')}` });
  }
  res.status(201).json(storeDocument(req, null, category));
});

// Encrypts the uploaded file to storage and records it. employeeId null =
// company document.
function storeDocument(req, employeeId, category) {
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

  return {
    id: info.lastInsertRowid,
    employee_id: employeeId,
    category,
    original_filename: req.file.originalname,
    mime_type: req.file.mimetype,
    size: req.file.size,
  };
}

function streamDocument(req, res, disposition) {
  const id = Number(req.params.id);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Company documents (employee_id null) are staff-only.
  if (!isStaff(req) && (doc.employee_id == null || findOwnEmployeeId(req.user.id) !== doc.employee_id)) {
    return res.status(403).json({ error: 'You do not have permission to view this document' });
  }

  const ciphertext = fs.readFileSync(path.join(storageDir, doc.stored_filename));
  const plain = decryptBuffer(ciphertext, doc.iv, doc.auth_tag);

  writeAuditLog(req.user.id, disposition === 'inline' ? 'document_viewed' : 'document_downloaded', 'document', id, {
    employeeId: doc.employee_id,
  });

  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.original_filename)}"`);
  res.send(plain);
}

router.get('/:id/download', (req, res) => streamDocument(req, res, 'attachment'));
router.get('/:id/view', (req, res) => streamDocument(req, res, 'inline'));

router.delete('/:id', requireRole('admin', 'hr'), (req, res) => {
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

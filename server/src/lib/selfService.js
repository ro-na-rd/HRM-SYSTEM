const db = require('../db');
const { writeAuditLog } = require('./audit');

// Replaces the old "your login must be linked to an employee record by HR"
// gate. An employee with no linked employee record gets one created
// automatically the first time their own data is read or written, so they
// can use every self-service feature (dashboard, leave, documents, letters,
// attendance, payslips, performance) without HR/Admin linking them first.
// Never auto-creates for Admin/HR (staff don't have their own employee
// records - the roster entry is created by HR intentionally).
function findOrCreateOwnEmployeeId(userId) {
  const existing = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(userId);
  if (existing) return existing.id;

  const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(userId);
  if (!user || user.role !== 'employee') return null;

  const info = db
    .prepare('INSERT INTO employees (full_name, user_id, active) VALUES (?, ?, 1)')
    .run(user.name || 'Employee', user.id);
  writeAuditLog(user.id, 'employee_self_provisioned', 'employee', info.lastInsertRowid, {
    reason: 'auto-linked on first self-service use',
  });
  return Number(info.lastInsertRowid);
}

module.exports = { findOrCreateOwnEmployeeId };
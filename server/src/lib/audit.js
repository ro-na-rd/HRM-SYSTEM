const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO audit_log (user_id, action, target_type, target_id, details)
  VALUES (?, ?, ?, ?, ?)
`);

function writeAuditLog(userId, action, targetType = null, targetId = null, details = null) {
  insertStmt.run(userId ?? null, action, targetType, targetId ?? null, details ? JSON.stringify(details) : null);
}

module.exports = { writeAuditLog };

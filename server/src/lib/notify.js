const db = require('../db');

const insertStmt = db.prepare(
  'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)'
);

// Add a notification for one user. No-op if userId is null (e.g. an
// employee record that isn't linked to a login yet).
function notify(userId, { type, title, body = null, link = null }) {
  if (!userId) return;
  insertStmt.run(userId, type, title, body, link);
}

function employeeUserId(employeeId) {
  const row = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(employeeId);
  return row ? row.user_id : null;
}

function notifyEmployee(employeeId, payload) {
  notify(employeeUserId(employeeId), payload);
}

// Notify every active Admin/HR user, optionally skipping the person who
// triggered the event.
function notifyStaff(payload, exceptUserId = null) {
  const staff = db.prepare("SELECT id FROM users WHERE role IN ('admin', 'hr') AND active = 1").all();
  for (const u of staff) {
    if (u.id !== exceptUserId) notify(u.id, payload);
  }
}

module.exports = { notify, notifyEmployee, notifyStaff, employeeUserId };

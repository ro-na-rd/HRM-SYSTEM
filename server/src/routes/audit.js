const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// An employee's own activity feed: things they did, plus things done to
// their own records (their leave requests, their letters, their employee
// record) - e.g. "Leave request approved" shows up here even though HR is
// the one who performed that action, because it's about the employee's own data.
router.get('/mine', requireAuth, (req, res) => {
  const employee = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(req.user.id);
  const employeeId = employee ? employee.id : null;

  const rows = db
    .prepare(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at
       FROM audit_log a
       WHERE a.user_id = ?
          OR (a.target_type = 'employee' AND a.target_id = ?)
          OR (a.target_type = 'leave_request' AND a.target_id IN (SELECT id FROM leave_requests WHERE employee_id = ?))
          OR (a.target_type = 'letter' AND a.target_id IN (SELECT id FROM letters WHERE employee_id = ?))
          OR (a.target_type = 'payslip' AND a.target_id IN (SELECT id FROM payslips WHERE employee_id = ?))
       ORDER BY a.created_at DESC
       LIMIT 20`
    )
    .all(req.user.id, employeeId, employeeId, employeeId, employeeId);
  res.json(rows);
});

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
              u.name AS user_name, u.email AS user_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 500`
    )
    .all();
  res.json(rows);
});

module.exports = router;

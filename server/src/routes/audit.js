const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

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

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// The signed-in user's own notifications, newest first, plus the unread count.
router.get('/', (req, res) => {
  const items = db
    .prepare(
      `SELECT id, type, title, body, link, read_at, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user.id);
  const unread = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(req.user.id).c;
  res.json({ items, unread });
});

router.post('/:id/read', (req, res) => {
  const id = Number(req.params.id);
  const info = db
    .prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL")
    .run(id, req.user.id);
  res.json({ ok: true, updated: info.changes });
});

router.post('/read-all', (req, res) => {
  const info = db
    .prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL")
    .run(req.user.id);
  res.json({ ok: true, updated: info.changes });
});

module.exports = router;

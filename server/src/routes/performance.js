const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');
const { notifyEmployee } = require('../lib/notify');
const { findOrCreateOwnEmployeeId } = require('../lib/selfService');

const router = express.Router();
router.use(requireAuth);

function notifyPublished(employeeId, period) {
  notifyEmployee(employeeId, {
    type: 'review',
    title: 'Performance review published',
    body: `Your review for ${period} is ready to read.`,
    link: '/profile/performance',
  });
}

function findOwnEmployeeId(userId) {
  return findOrCreateOwnEmployeeId(userId);
}

function isStaff(req) {
  return req.user.role === 'admin' || req.user.role === 'hr';
}

// A timestamp in the same 'YYYY-MM-DD HH:MM:SS' shape sqlite's datetime('now') uses.
function sqlNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

const optionalRating = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.coerce.number().int().min(1).max(5).nullable()
);

const createSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  period: z.string().trim().min(1, 'Review period is required'),
  review_date: z.string().optional().nullable(),
  rating: optionalRating,
  summary: z.string().optional().nullable(),
  strengths: z.string().optional().nullable(),
  improvements: z.string().optional().nullable(),
  goals: z.string().optional().nullable(),
  status: z.enum(['draft', 'published']).default('draft'),
});

const updateSchema = z.object({
  period: z.string().trim().min(1).optional(),
  review_date: z.string().optional().nullable(),
  rating: optionalRating.optional(),
  summary: z.string().optional().nullable(),
  strengths: z.string().optional().nullable(),
  improvements: z.string().optional().nullable(),
  goals: z.string().optional().nullable(),
  status: z.enum(['draft', 'published']).optional(),
});

// HR sees every review; an employee sees only their own published ones.
router.get('/reviews', (req, res) => {
  if (isStaff(req)) {
    const rows = db
      .prepare(
        `SELECT p.*, e.full_name AS employee_name, u.name AS reviewer_name
         FROM performance_reviews p
         JOIN employees e ON e.id = p.employee_id
         LEFT JOIN users u ON u.id = p.reviewer_id
         ORDER BY p.created_at DESC`
      )
      .all();
    return res.json(rows);
  }

  const employeeId = findOwnEmployeeId(req.user.id);
  if (!employeeId) return res.json([]);
  const rows = db
    .prepare(
      `SELECT p.id, p.employee_id, p.period, p.review_date, p.rating, p.summary, p.strengths,
              p.improvements, p.goals, p.status, p.acknowledged_at, p.published_at,
              u.name AS reviewer_name
       FROM performance_reviews p
       LEFT JOIN users u ON u.id = p.reviewer_id
       WHERE p.employee_id = ? AND p.status = 'published'
       ORDER BY p.published_at DESC, p.created_at DESC`
    )
    .all(employeeId);
  res.json(rows);
});

router.post('/reviews', requireRole('admin', 'hr'), (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(d.employee_id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const info = db
    .prepare(
      `INSERT INTO performance_reviews
         (employee_id, period, review_date, rating, summary, strengths, improvements, goals,
          status, reviewer_id, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      d.employee_id,
      d.period,
      d.review_date || null,
      d.rating ?? null,
      d.summary || null,
      d.strengths || null,
      d.improvements || null,
      d.goals || null,
      d.status,
      req.user.id,
      d.status === 'published' ? sqlNow() : null
    );

  writeAuditLog(
    req.user.id,
    d.status === 'published' ? 'review_published' : 'review_created',
    'performance_review',
    info.lastInsertRowid,
    { employeeId: d.employee_id }
  );
  if (d.status === 'published') notifyPublished(d.employee_id, d.period);
  res.status(201).json(db.prepare('SELECT * FROM performance_reviews WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/reviews/:id', requireRole('admin', 'hr'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM performance_reviews WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Review not found' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const pick = (key, fallback) => (d[key] !== undefined ? d[key] || null : fallback);
  const merged = {
    period: d.period !== undefined ? d.period : existing.period,
    review_date: pick('review_date', existing.review_date),
    rating: d.rating !== undefined ? d.rating : existing.rating,
    summary: pick('summary', existing.summary),
    strengths: pick('strengths', existing.strengths),
    improvements: pick('improvements', existing.improvements),
    goals: pick('goals', existing.goals),
    status: d.status !== undefined ? d.status : existing.status,
  };

  let publishedAt = existing.published_at;
  let acknowledgedAt = existing.acknowledged_at;
  const nowPublishing = merged.status === 'published' && existing.status !== 'published';
  const nowUnpublishing = merged.status === 'draft' && existing.status === 'published';
  if (nowPublishing) publishedAt = sqlNow();
  if (nowUnpublishing) acknowledgedAt = null; // employee re-acknowledges the revised version

  db.prepare(
    `UPDATE performance_reviews
     SET period = ?, review_date = ?, rating = ?, summary = ?, strengths = ?, improvements = ?,
         goals = ?, status = ?, published_at = ?, acknowledged_at = ?
     WHERE id = ?`
  ).run(
    merged.period,
    merged.review_date,
    merged.rating,
    merged.summary,
    merged.strengths,
    merged.improvements,
    merged.goals,
    merged.status,
    publishedAt,
    acknowledgedAt,
    id
  );

  writeAuditLog(req.user.id, nowPublishing ? 'review_published' : 'review_updated', 'performance_review', id, {
    employeeId: existing.employee_id,
  });
  if (nowPublishing) notifyPublished(existing.employee_id, merged.period);
  res.json(db.prepare('SELECT * FROM performance_reviews WHERE id = ?').get(id));
});

router.delete('/reviews/:id', requireRole('admin', 'hr'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM performance_reviews WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Review not found' });
  db.prepare('DELETE FROM performance_reviews WHERE id = ?').run(id);
  writeAuditLog(req.user.id, 'review_deleted', 'performance_review', id, { employeeId: row.employee_id });
  res.json({ ok: true });
});

// Employee confirms they have seen their published review.
router.post('/reviews/:id/acknowledge', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM performance_reviews WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Review not found' });
  if (findOwnEmployeeId(req.user.id) !== row.employee_id) {
    return res.status(403).json({ error: 'This is not your review' });
  }
  if (row.status !== 'published') {
    return res.status(400).json({ error: 'This review is not published yet' });
  }
  if (!row.acknowledged_at) {
    db.prepare('UPDATE performance_reviews SET acknowledged_at = ? WHERE id = ?').run(sqlNow(), id);
    writeAuditLog(req.user.id, 'review_acknowledged', 'performance_review', id, { employeeId: row.employee_id });
  }
  res.json(db.prepare('SELECT * FROM performance_reviews WHERE id = ?').get(id));
});

module.exports = router;

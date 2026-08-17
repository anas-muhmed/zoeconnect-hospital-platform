// Notification routes — moved out of server.js unchanged, mounted at
// /api/notifications in server.js (so paths here are relative to that).
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style/boolean/casing conventions
// used app-wide. One thing that did NOT need converting: `FETCH FIRST n
// ROWS ONLY` is standard SQL:2008, not an Oracle-ism — Postgres supports
// it natively, unchanged.

import express from 'express';
import { getPgPool } from '../db/pgPool.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /api/notifications/:userId
router.get('/:userId', requireAuth, async (req, res) => {
  if (req.user.id !== Number(req.params.userId)) {
    return res.status(403).json({ error: 'You are not authorized to view these notifications.' });
  }
  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT n.*, dr.brand_name, dr.current_stage
       FROM notifications n
       LEFT JOIN drug_requests dr ON dr.request_id = n.request_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       FETCH FIRST 50 ROWS ONLY`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET notifications error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const ownerCheck = await pool.query(
      `SELECT user_id FROM notifications WHERE notification_id = $1`,
      [req.params.id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    // notifications.user_id is BIGINT -> node-postgres returns it as a
    // string (see routes/auth.js's dbUserId comment for the full
    // reasoning, and the real bug this exact pattern caused there).
    // req.user.id is a real number by the time it reaches here (auth.js
    // now converts it before signing the token) -- Number(...) here so
    // this comparison isn't comparing a string to a number.
    if (Number(ownerCheck.rows[0].user_id) !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to modify this notification.' });
    }

    // is_read is a real BOOLEAN column now, not NUMBER(1) -- true, not 1.
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE notification_id = $1`,
      [req.params.id]
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    console.error('PUT notification read error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

export default router;

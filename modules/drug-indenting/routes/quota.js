// Doctor/HOD request-quota route — moved out of server.js unchanged.
// Mounted at /api/user/quota (singular "user", matching the original
// path — an existing inconsistency with /api/users, not something to
// silently "fix" as part of a pure structural move).
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header and migration/docs/route-conversion-plan.md
// for the bind-style/boolean/casing conventions used app-wide; this file
// additionally introduces the Oracle SYSDATE/TRUNC/ADD_MONTHS -> Postgres
// date-arithmetic conversion for the first time (see inline comment
// below for the reasoning).

import express from 'express';
import { getPgPool } from '../db/pgPool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { ROLES } from '../utils/workflow.js';

const router = express.Router();

router.get('/:userId', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'You are not authorized to view this quota.' });
  }

  const pool = getPgPool();
  try {
    const userRes = await pool.query(
      `SELECT role FROM users WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found or inactive.' });
    }
    const role = userRes.rows[0].role ? userRes.rows[0].role.toLowerCase() : '';
    if (role !== ROLES.DOCTOR && role !== ROLES.HOD) {
      return res.status(400).json({ error: 'Request quota is only applicable for Doctors or HODs.' });
    }

    const qCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM user_request_quotas WHERE user_id = $1`,
      [userId]
    );
    if (Number(qCheck.rows[0].cnt) === 0) {
      await pool.query(
        `INSERT INTO user_request_quotas (user_id, quarterly_limit, updated_by)
         VALUES ($1, 10, $1)`,
        [userId]
      );
    }

    // Oracle's TRUNC(SYSDATE, 'Q') truncates "now" to the start of the
    // current calendar quarter; ADD_MONTHS(..., 3) steps that forward
    // exactly one quarter to get the exclusive upper bound. Postgres has
    // no ADD_MONTHS, and date_trunc('quarter', ...) is the direct
    // equivalent of TRUNC(date, 'Q') -- so the upper bound becomes
    // date_trunc('quarter', now()) + INTERVAL '3 months', not a syntax
    // swap but the same real calculation (start of next quarter),
    // expressed in Postgres's own interval-arithmetic idiom.
    const result = await pool.query(
      `SELECT
         q.quarterly_limit,
         (
           SELECT COUNT(*) FROM drug_requests dr
           WHERE dr.created_by_user_id = $1
             AND dr.created_at >= date_trunc('quarter', CURRENT_TIMESTAMP)
             AND dr.created_at <  date_trunc('quarter', CURRENT_TIMESTAMP) + INTERVAL '3 months'
         ) AS used_this_quarter
       FROM user_request_quotas q
       WHERE q.user_id = $1`,
      [userId]
    );

    const r = result.rows[0];
    // quarterly_limit is a real INTEGER column -> pg returns it as a JS
    // number directly. used_this_quarter is a COUNT(*) result -> Postgres
    // BIGINT, which pg returns as a STRING (avoids silent precision loss
    // for values that could exceed Number.MAX_SAFE_INTEGER). Explicit
    // Number(...) here for the same reason as routes/auth.js's count
    // checks -- correct either way for this table's real size, but
    // explicit rather than relying on `-`'s implicit string coercion.
    const limit = r.quarterly_limit;
    const used = Number(r.used_this_quarter);

    res.json({
      quarterly_limit: limit,
      used_this_quarter: used,
      remaining_quota: Math.max(0, limit - used)
    });
  } catch (err) {
    console.error('GET /api/user/quota/:userId error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

export default router;

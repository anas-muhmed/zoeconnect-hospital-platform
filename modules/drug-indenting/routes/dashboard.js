// Dashboard route — moved out of server.js unchanged, mounted at
// /api/dashboard. Has custom inline auth (not requireAuth/requireRole)
// because it has three different authorization shapes in one route:
// doctor/hod are personal (must match your own userId), other clinical
// roles are role-level aggregates, and admin needs a separate admin
// token entirely. See utils/workflow.js for why these role/stage
// spellings look the way they do.
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style/boolean/casing conventions
// used app-wide. This file's own real pattern: a WHERE clause built
// dynamically and reused across 7 separate queries with the same bind
// values -- Oracle's named binds resolve by name per query.execute()
// call regardless of how many queries share one binds object; Postgres's
// positional binds needed an explicit "add a param, get back its $N"
// helper to keep that same one-shared-values-array behavior.

import express from 'express';
import { getPgPool } from '../db/pgPool.js';
import { extractBearerToken, verifyToken } from '../utils/auth.js';
import { ROLES, rolesMatch } from '../utils/workflow.js';

const router = express.Router();

// GET /api/dashboard/:role
router.get('/:role', async (req, res) => {
  const { role } = req.params;
  const { userId, source_type, formulary_type } = req.query;
  const normalizedRole = role ? role.toLowerCase().trim() : '';

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }

  if (normalizedRole === ROLES.ADMIN) {
    if (decoded.type !== 'admin') {
      return res.status(403).json({ error: 'Only an admin can view this dashboard.' });
    }
  } else {
    // Role-level dashboards (pharmacyhead/pharmacist/dtccommittee/ceo) just
    // require your token's role to match; doctor/hod additionally require
    // the userId query param to be you, since those are personal views.
    // rolesMatch() (not strict equality) handles the 'dtc'/'dtccommittee'
    // alias -- see utils/workflow.js.
    if (decoded.type !== 'user' || !rolesMatch(decoded.role, normalizedRole)) {
      return res.status(403).json({ error: 'You are not authorized to view this dashboard.' });
    }
    if ((normalizedRole === ROLES.DOCTOR || normalizedRole === ROLES.HOD) && decoded.id !== Number(userId)) {
      return res.status(403).json({ error: 'You can only view your own dashboard.' });
    }
  }

  const pool = getPgPool();
  try {
    let whereClause = '1=1';
    const values = [];
    // Pushes a value and returns its positional placeholder -- reused
    // (same $N) when the same value needs to appear twice in one clause
    // (HOD's OR below), matching how the Oracle version reused one named
    // bind for both sides of that same OR.
    function addParam(val) {
      values.push(val);
      return `$${values.length}`;
    }

    if (normalizedRole === ROLES.DOCTOR) {
      whereClause = `doctor_id = ${addParam(userId)}`;
    } else if (normalizedRole === ROLES.HOD) {
      const p = addParam(userId);
      whereClause = `(hod_id = ${p} OR created_by_user_id = ${p})`;
    } else if (normalizedRole === ROLES.PHARMACY_HEAD) {
      whereClause = `current_stage IN ('PharmacyHead','DTCCommittee','Pharmacist','PharmacyHeadReview2','DTCFinal','CEO','Final','Rejected','EmergencyDTC')`;
    } else if (normalizedRole === ROLES.PHARMACIST) {
      whereClause = `current_stage IN ('Pharmacist','PharmacyHeadReview2','DTCFinal','CEO','Final','Rejected','EmergencyDTC')`;
    } else if (normalizedRole === ROLES.DTC_COMMITTEE) {
      whereClause = `current_stage IN ('DTCCommittee','Pharmacist','PharmacyHeadReview2','DTCFinal','CEO','Final','Rejected','EmergencyDTC')`;
    } else if (normalizedRole === ROLES.CEO) {
      whereClause = `current_stage IN ('CEO','Final','Rejected')`;
    } else if (normalizedRole === ROLES.ADMIN) {
      whereClause = '1=1';
    }

    // Optional source_type filter
    if (source_type && ['PROMOTIONAL', 'NON_PROMOTIONAL'].includes(source_type.toUpperCase())) {
      whereClause += ` AND request_source_type = ${addParam(source_type.toUpperCase())}`;
    }
    if (formulary_type && ['FORMULARY', 'NON_FORMULARY'].includes(formulary_type.toUpperCase())) {
      whereClause += ` AND formulary_request_type = ${addParam(formulary_type.toUpperCase())}`;
    }

    const totalResult = await pool.query(`SELECT COUNT(*) AS cnt FROM drug_requests WHERE ${whereClause}`, values);
    const approvedResult = await pool.query(`SELECT COUNT(*) AS cnt FROM drug_requests WHERE ${whereClause} AND status = 'Approved'`, values);
    const rejectedResult = await pool.query(`SELECT COUNT(*) AS cnt FROM drug_requests WHERE ${whereClause} AND status = 'Rejected'`, values);
    const pendingResult = await pool.query(`SELECT COUNT(*) AS cnt FROM drug_requests WHERE ${whereClause} AND status = 'Pending'`, values);
    const catResult = await pool.query(`SELECT category, COUNT(*) AS cnt FROM drug_requests WHERE ${whereClause} GROUP BY category`, values);
    const promoResult = await pool.query(`SELECT COUNT(*) AS cnt FROM drug_requests WHERE ${whereClause} AND (request_source_type = 'PROMOTIONAL' OR request_source_type IS NULL)`, values);
    const nonPromoResult = await pool.query(`SELECT COUNT(*) AS cnt FROM drug_requests WHERE ${whereClause} AND request_source_type = 'NON_PROMOTIONAL'`, values);

    // COUNT(*) is Postgres BIGINT -> node-postgres returns it as a string
    // (same reasoning as routes/auth.js's count checks). These are real
    // counts the frontend displays directly (checked client/src/components/
    // Dashboard.js -- display-only, no arithmetic, so a string wouldn't
    // have visibly broken anything) -- Number(...) anyway, since the
    // honest type for a count is a number, not a numeric-looking string.
    res.json({
      total: Number(totalResult.rows[0].cnt),
      approved: Number(approvedResult.rows[0].cnt),
      rejected: Number(rejectedResult.rows[0].cnt),
      pending: Number(pendingResult.rows[0].cnt),
      by_category: catResult.rows.map(r => ({ category: r.category, cnt: Number(r.cnt) })),
      promotional: Number(promoResult.rows[0].cnt),
      non_promotional: Number(nonPromoResult.rows[0].cnt),
    });
  } catch (err) {
    console.error('GET dashboard error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

export default router;

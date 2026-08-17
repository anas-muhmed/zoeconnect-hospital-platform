// DTC (Drugs & Therapeutics Committee) management routes — moved out
// of server.js unchanged, mounted at /api/dtc. All restricted to
// dtc/dtccommittee (or admin) per requireRole.
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style conventions used app-wide.
//
// Real, file-specific decisions:
//
// 1. Oracle's executeMany() (4 sites) has no direct pg equivalent.
//    Where every row gets the SAME assigned value (e.g. marking several
//    alt_ids as is_final_selected), a single `WHERE x = ANY($1::bigint[])`
//    with an array parameter is the clean Postgres idiom -- one round
//    trip, no VALUES-join needed. Where each row needs a DIFFERENT
//    assigned value (per-row remark text), the real Postgres bulk-write
//    idiom is `UPDATE t SET col = v.col FROM (VALUES ...) AS v(...)
//    WHERE t.id = v.id` -- still one round trip, preserving the original
//    "batched instead of N round trips" intent documented in the
//    existing comments, not silently regressing to a query-per-row loop.
//
// 2. The trailing `conn.commit()` calls (final-select, blacklist,
//    blacklist/remove) turned out to be dead code once actually traced:
//    db/pool.js sets `oracledb.autoCommit = true` globally, and none of
//    these routes' individual execute() calls override that per-call --
//    so every statement was ALREADY auto-committing individually as it
//    ran, regardless of the trailing commit(). The apparent "one atomic
//    transaction" these handlers seem to describe was never actually
//    atomic in the Oracle version either. Preserving that REAL (if
//    surprising) current behavior means using pool.query() per
//    statement here too, not introducing new atomicity via a real
//    BEGIN/COMMIT that wasn't there before -- same reasoning already
//    applied to routes/pharmacistDrafts.js's commit() calls.
//
// 3. GET /blacklist spreads raw rows directly, and
//    client/src/components/DTCCommitteeTab.js reads b.BLACKLIST_ID,
//    b.COMPANY_NAME, etc. with no fallback -- same upperKeys() treatment
//    as pharmacistDrafts.js/users.js/admin.js. GET /user-quotas and PUT
//    /user-quotas/:userId hand-build their response objects already
//    (lowercase keys, matching pg's natural casing) -- no change needed
//    there beyond the internal property-access fixes.

import express from 'express';
import { getPgPool } from '../db/pgPool.js';
import { requireRole } from '../middleware/requireAuth.js';
import { writeAudit, createNotification, createNotificationsBulk, saveApprovalRemarks } from '../utils/auditHelpersPg.js';
import { ROLES } from '../utils/workflow.js';

const router = express.Router();

function upperKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.toUpperCase()] = v;
  return out;
}

router.get('/user-quotas', requireRole('dtc', ROLES.DTC_COMMITTEE), async (req, res) => {
  const pool = getPgPool();
  try {
    const usersRes = await pool.query(
      `SELECT user_id, name, email, role, department FROM users
       WHERE LOWER(role) IN ('doctor', 'hod') AND is_active = true`
    );
    const users = usersRes.rows;

    // Was 1-2 round trips PER doctor/HOD user (exists-check + conditional
    // backfill insert) -- batched into at most 2 round trips total.
    if (users.length > 0) {
      const userIds = users.map(u => Number(u.user_id));
      const existingQuotasRes = await pool.query(
        `SELECT user_id FROM user_request_quotas WHERE user_id = ANY($1::bigint[])`,
        [userIds]
      );
      const hasQuota = new Set(existingQuotasRes.rows.map(r => Number(r.user_id)));
      const missing = users.filter(u => !hasQuota.has(Number(u.user_id)));

      if (missing.length > 0) {
        const values = [];
        const tuples = missing.map((u, i) => {
          const id = Number(u.user_id);
          values.push(id, id);
          return `($${i * 2 + 1}, 10, $${i * 2 + 2})`;
        });
        await pool.query(
          `INSERT INTO user_request_quotas (user_id, quarterly_limit, updated_by) VALUES ${tuples.join(', ')}`,
          values
        );
      }
    }

    const result = await pool.query(
      `SELECT
         u.user_id,
         u.name,
         u.email,
         u.role,
         u.department,
         q.quarterly_limit,
         (
           SELECT COUNT(*) FROM drug_requests dr
           WHERE dr.created_by_user_id = u.user_id
             AND dr.created_at >= date_trunc('quarter', CURRENT_TIMESTAMP)
             AND dr.created_at <  date_trunc('quarter', CURRENT_TIMESTAMP) + INTERVAL '3 months'
         ) AS used_this_quarter
       FROM users u
       JOIN user_request_quotas q ON q.user_id = u.user_id
       WHERE LOWER(u.role) IN ('doctor', 'hod') AND u.is_active = true
       ORDER BY u.name`
    );

    const quotas = result.rows.map(r => {
      const limit = r.quarterly_limit;
      const used = Number(r.used_this_quarter);
      return {
        user_id: Number(r.user_id),
        name: r.name,
        email: r.email,
        role: r.role,
        department: r.department,
        quarterly_limit: limit,
        used_this_quarter: used,
        remaining_quota: Math.max(0, limit - used)
      };
    });

    res.json(quotas);
  } catch (err) {
    console.error('GET /api/dtc/user-quotas error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.put('/user-quotas/:userId', requireRole('dtc', ROLES.DTC_COMMITTEE), async (req, res) => {
  const pool = getPgPool();
  try {
    const userId = parseInt(req.params.userId);
    const { quarterly_limit, performed_by } = req.body;

    if (quarterly_limit === undefined || quarterly_limit === null || isNaN(Number(quarterly_limit)) || Number(quarterly_limit) < 0) {
      return res.status(400).json({ error: 'Limit must be a non-negative number.' });
    }

    const perfRes = await pool.query(
      `SELECT role FROM users WHERE user_id = $1 AND is_active = true`,
      [performed_by]
    );
    if (!perfRes.rows.length) {
      return res.status(403).json({ error: 'Performing user not found or inactive.' });
    }
    const perfRole = perfRes.rows[0].role ? perfRes.rows[0].role.toLowerCase() : '';
    if (perfRole !== 'dtc' && perfRole !== ROLES.DTC_COMMITTEE) {
      return res.status(403).json({ error: 'Unauthorized. Only DTC members can modify request quotas.' });
    }

    const userRes = await pool.query(
      `SELECT role FROM users WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'Target user not found or inactive.' });
    }
    const targetRole = userRes.rows[0].role ? userRes.rows[0].role.toLowerCase() : '';
    if (targetRole !== ROLES.DOCTOR && targetRole !== ROLES.HOD) {
      return res.status(400).json({ error: 'Quotas can only be assigned to Doctors or HODs.' });
    }

    const qCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM user_request_quotas WHERE user_id = $1`,
      [userId]
    );
    if (Number(qCheck.rows[0].cnt) > 0) {
      await pool.query(
        `UPDATE user_request_quotas
         SET quarterly_limit = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [Number(quarterly_limit), performed_by, userId]
      );
    } else {
      await pool.query(
        `INSERT INTO user_request_quotas (user_id, quarterly_limit, updated_by)
         VALUES ($1, $2, $3)`,
        [userId, Number(quarterly_limit), performed_by]
      );
    }

    res.json({ success: true, message: 'Quota updated successfully.' });
  } catch (err) {
    console.error('PUT /api/dtc/user-quotas/:userId error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.post('/final-select/:requestId', requireRole('dtc', ROLES.DTC_COMMITTEE), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.requestId);
    const {
      recommendations,
      selected_alternative_id,
      selection_type,
      remarks,
      dtc_selected_brand,
      dtc_selected_category,
      dtc_selection_reasons,
      dtc_recommendation_notes,
      dtc_reviewed_by_name,
      dtc_review_signature,
      dtc_remarks,
      alternatives: altRows,
      existing_details: existingRows
    } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    const reqResult = await pool.query(
      `SELECT dr.*, u.name AS doctor_name
       FROM drug_requests dr
       JOIN users u ON u.user_id = dr.doctor_id
       WHERE dr.request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });
    const dr = reqResult.rows[0];

    if (dr.current_stage !== 'DTCFinal') {
      return res.status(400).json({ error: 'Final drug selection is only allowed at DTCFinal stage.' });
    }

    // Reset all alternatives to not-selected
    await pool.query(
      `UPDATE drug_alternatives SET is_final_selected = false WHERE request_id = $1`,
      [requestId]
    );

    let recs = recommendations;
    if (!recs || !Array.isArray(recs)) {
      // Build synthesized recommendation for legacy API callers
      let selectedName = dr.brand_name;
      if (selection_type === 'alternative' && selected_alternative_id) {
        const altCheck = await pool.query(
          `SELECT * FROM drug_alternatives WHERE alt_id = $1 AND request_id = $2`,
          [selected_alternative_id, requestId]
        );
        if (altCheck.rows.length) {
          selectedName = altCheck.rows[0].brand_name;
        }
      }
      recs = [{
        brand_name: dtc_selected_brand || selectedName,
        category: dtc_selected_category || 'Formulary',
        reasons: dtc_selection_reasons || ['DTC Approved'],
        is_original: selection_type === 'original' || (!selected_alternative_id && selection_type !== 'alternative'),
        alternative_id: selection_type === 'alternative' ? selected_alternative_id : null
      }];
    }

    const selectedAltIds = recs
      .filter(rec => !rec.is_original && rec.alternative_id)
      .map(rec => rec.alternative_id);

    if (selectedAltIds.length > 0) {
      // Every id in this list gets the SAME value (true) -- a single
      // WHERE ... = ANY($array) is the clean one-round-trip idiom here,
      // no per-row VALUES join needed since nothing else varies per row.
      await pool.query(
        `UPDATE drug_alternatives SET is_final_selected = true WHERE alt_id = ANY($1::bigint[]) AND request_id = $2`,
        [selectedAltIds, requestId]
      );
    }

    const selectedBrandsList = recs && recs.length > 0
      ? recs.map(rec => rec.brand_name).join(', ')
      : 'DTC Reviewed';
    const hasFormulary = recs.some(rec => rec.category === 'FORMULARY');
    const aggregatedCategory = hasFormulary ? 'FORMULARY' : (recs[0]?.category || 'NON_FORMULARY');

    const allReasonsSet = new Set();
    recs.forEach(rec => {
      if (Array.isArray(rec.reasons)) {
        rec.reasons.forEach(r => allReasonsSet.add(r));
      }
    });
    const mergedReasons = Array.from(allReasonsSet);
    const selectionReasonsJson = JSON.stringify(mergedReasons);

    const finalNotes = (recs && recs.length > 0)
      ? recs.map(r => `${r.brand_name}: [Notes: ${r.notes || '—'}][Remarks: ${r.remarks || '—'}]`).join(' | ')
      : (dtc_recommendation_notes || remarks || null);
    const recommendationsJson = JSON.stringify(recs);

    // Prefer the entry actually marked "Recommended" -- picking blindly by
    // array order let a Not-Recommended alternative win final selection
    // whenever it happened to come first (real cases: requests #744, #761).
    // Fall back to the old "first non-original" behavior only if nothing
    // qualifies, so this can't return null for recs shapes that predate
    // ComparisonSheet.js's buildAutoRecommendations() always setting remarks.
    const recommendedAlt = recs.find(rec => !rec.is_original && rec.alternative_id && rec.remarks === 'Recommended');
    const firstAlt = recommendedAlt || recs.find(rec => !rec.is_original && rec.alternative_id);
    const finalAltId = firstAlt ? firstAlt.alternative_id : null;

    // Store the selection details on the request.
    // Real bug found and fixed while testing: $2 was originally reused
    // for dtc_final_selection_notes AND dtc_recommendation_notes/
    // final_recommendation_notes, but the first is VARCHAR(1000) while
    // the other two are TEXT -- Postgres couldn't unify one parameter's
    // type across columns declared differently ("inconsistent types
    // deduced for parameter $2" / "character varying versus text").
    // Oracle's named binds never hit this because :notes could resolve
    // per-column without a single shared type needing inference across
    // the whole statement. Fixed by giving dtc_final_selection_notes its
    // own parameter ($12) instead of reusing $2 -- every other reused
    // parameter here ($3/$4/$5/$6) pairs columns that really do share
    // the same declared type, so those are left as genuine, safe reuse.
    await pool.query(
      `UPDATE drug_requests
         SET final_selected_alternative_id = $1,
             dtc_final_selection_notes     = $12,
             dtc_final_remarks             = $3,
             dtc_remarks                   = $3,
             dtc_selected_brand            = $4,
             dtc_selected_category         = $5,
             dtc_selection_reasons         = $6,
             dtc_recommendation_notes      = $2,
             dtc_reviewed_by               = $7,
             dtc_reviewed_at               = CURRENT_TIMESTAMP,
             current_stage                 = 'CEO',
             status                        = 'Pending',
             updated_at                    = CURRENT_TIMESTAMP,
             dtc_reviewed_by_name          = $8,
             dtc_review_signature          = $9,
             final_selected_brand          = $4,
             final_selected_category       = $5,
             final_selection_reasons       = $6,
             final_recommendation_notes    = $2,
             dtc_final_recommendations     = $10
       WHERE request_id = $11`,
      [
        finalAltId,
        finalNotes,
        dtc_remarks || finalNotes || null,
        selectedBrandsList,
        aggregatedCategory,
        selectionReasonsJson,
        performed_by,
        dtc_reviewed_by_name || null,
        dtc_review_signature || null,
        recommendationsJson,
        requestId,
        finalNotes,
      ]
    );

    // ── Persist DTC-set row-level remarks on alternatives ──────────────────
    // Was up to 4 round trips PER row (update remark, check-exists, fetch
    // original row, insert/update negotiation) -- batched into at most 4
    // round trips TOTAL regardless of how many rows there are.
    if (Array.isArray(altRows) && altRows.length > 0) {
      const rows = altRows
        .map(alt => ({
          // Number(...), not the raw client value -- alt_id arrives from
          // JSON as a string, but existingNegIds below is a Set of Numbers
          // (from Number(r.alternative_id)). Without this coercion,
          // existingNegIds.has(r.altId) always misses (strict equality,
          // "11" !== 11), so a negotiation row that already exists is never
          // recognized as existing -- every DTC remark update inserted a
          // brand-new duplicate negotiation row instead of updating the
          // real one, which is exactly why drugs were appearing multiple
          // times in the comparison sheet.
          altId: Number(alt.alt_id || alt.ALT_ID),
          altRemark: alt.remark ?? alt.REMARK ?? null,
          altNegRemark: alt.negotiation_remarks ?? alt.NEGOTIATION_REMARKS ?? null
        }))
        .filter(r => r.altId);

      // 1. Batch-update the plain remark for every row that provided one --
      // each row gets a DIFFERENT remark, so this needs the real
      // UPDATE-FROM-VALUES idiom, not a shared ANY() array.
      const remarkUpdates = rows.filter(r => r.altRemark !== null && r.altRemark !== undefined);
      if (remarkUpdates.length > 0) {
        const values = [];
        const tuples = remarkUpdates.map((r, i) => {
          values.push(String(r.altRemark), r.altId);
          return `($${i * 2 + 1}::text, $${i * 2 + 2}::bigint)`;
        });
        values.push(requestId);
        await pool.query(
          `UPDATE drug_alternatives AS da
             SET remark = v.remark
           FROM (VALUES ${tuples.join(', ')}) AS v(remark, alt_id)
           WHERE da.alt_id = v.alt_id AND da.request_id = $${values.length}`,
          values
        );
      }

      // 2. Figure out which alt_ids already have a negotiation row, in one query
      const negRows = rows.filter(r => r.altNegRemark !== null && r.altNegRemark !== undefined);
      if (negRows.length > 0) {
        const negAltIds = [...new Set(negRows.map(r => r.altId))];
        const existingNegRes = await pool.query(
          `SELECT alternative_id FROM drug_alternative_negotiations WHERE alternative_id = ANY($1::bigint[])`,
          [negAltIds]
        );
        const existingNegIds = new Set(existingNegRes.rows.map(r => Number(r.alternative_id)));

        const toUpdate = negRows.filter(r => existingNegIds.has(r.altId));
        const toInsert = negRows.filter(r => !existingNegIds.has(r.altId));

        // 3. Batch-update negotiation_remarks for rows that already have one
        if (toUpdate.length > 0) {
          const values = [];
          const tuples = toUpdate.map((r, i) => {
            values.push(String(r.altNegRemark), r.altId);
            return `($${i * 2 + 1}::text, $${i * 2 + 2}::bigint)`;
          });
          await pool.query(
            `UPDATE drug_alternative_negotiations AS n
               SET negotiation_remarks = v.remark
             FROM (VALUES ${tuples.join(', ')}) AS v(remark, alt_id)
             WHERE n.alternative_id = v.alt_id`,
            values
          );
        }

        // 4. Batch-insert new negotiation rows, using original alternative
        // data (fetched once, in one query) for the required default columns
        if (toInsert.length > 0) {
          const insertAltIds = [...new Set(toInsert.map(r => r.altId))];
          const origRowsRes = await pool.query(
            `SELECT * FROM drug_alternatives WHERE alt_id = ANY($1::bigint[])`,
            [insertAltIds]
          );
          const origByAltId = new Map(origRowsRes.rows.map(row => [Number(row.alt_id), row]));

          const insertValues = [];
          const insertTuples = toInsert.map((r, i) => {
            const originalAlt = origByAltId.get(r.altId) || {};
            const base = i * 11;
            insertValues.push(
              r.altId,
              originalAlt.mrp_per_pack ?? null,
              originalAlt.rate_per_pack ?? null,
              originalAlt.gst_percent ?? null,
              originalAlt.scheme_qty ?? null,
              originalAlt.scheme_offer ?? null,
              originalAlt.net_rate ?? null,
              originalAlt.profit_margin ?? null,
              originalAlt.absolute_margin ?? null,
              originalAlt.total_margin ?? null,
              String(r.altNegRemark)
            );
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, ${performed_by}, CURRENT_TIMESTAMP, $${base + 11})`;
          });

          await pool.query(
            `INSERT INTO drug_alternative_negotiations (
               alternative_id, negotiated_mrp, negotiated_rate, negotiated_gst,
               negotiated_scheme_qty, negotiated_scheme_offer, negotiated_net_rate,
               negotiated_profit_margin, negotiated_absolute_margin, negotiated_total_margin,
               negotiated_by, negotiated_at, negotiation_remarks
             ) VALUES ${insertTuples.join(', ')}`,
            insertValues
          );
        }
      }
    }

    // ── Persist DTC-set row-level remarks on existing details ──────────────
    // Was one UPDATE per row -- batches into a single round trip.
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      const detailRows = [];
      existingRows.forEach((row, rowIdx) => {
        const rowRemark = row.remark ?? row.REMARK ?? null;
        if (rowRemark !== null && rowRemark !== undefined) {
          const rowNo = row.row_no ?? row.ROW_NO ?? (rowIdx + 1);
          detailRows.push({ remark: String(rowRemark), rowNo });
        }
      });
      if (detailRows.length > 0) {
        const values = [];
        const tuples = detailRows.map((r, i) => {
          values.push(r.remark, r.rowNo);
          return `($${i * 2 + 1}::text, $${i * 2 + 2}::integer)`;
        });
        values.push(requestId);
        await pool.query(
          `UPDATE drug_existing_details AS de
             SET remark = v.remark
           FROM (VALUES ${tuples.join(', ')}) AS v(remark, row_no)
           WHERE de.row_no = v.row_no AND de.request_id = $${values.length}`,
          values
        );
      }
    }

    await writeAudit(pool, requestId, 'DTC_FINAL_SELECTION', performed_by, 'DTCFinal', 'CEO',
      `Selected: ${selectedBrandsList}. ${remarks || ''}`);

    // Save DTC final select notes/remarks to history
    const dtcNotesText = dtc_recommendation_notes || remarks || dtc_remarks;
    if (dtcNotesText) {
      const customRemarksVal = req.body.customRemarks || dtcNotesText;
      await saveApprovalRemarks(pool, customRemarksVal, 'DTC', performed_by);
    }

    // Notify CEO
    const ceoUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'CEO' AND is_active = true`
    );
    await createNotificationsBulk(pool, ceoUsers.rows.map(r => Number(r.user_id)), requestId,
      `🏛️ Drug request #${requestId} (${dr.brand_name}) — DTC has reviewed and forwarded to CEO. Selected drug(s): ${selectedBrandsList}. Awaiting your approval.`
    );
    // Notify doctor
    await createNotification(pool, Number(dr.doctor_id), requestId,
      `Your drug request #${requestId} has been reviewed by DTC. Selected drug(s): ${selectedBrandsList}. Forwarded to CEO for final approval.`
    );

    res.json({ message: 'Final drug selected. Request forwarded to CEO.', selected_drug: selectedBrandsList });
  } catch (err) {
    console.error('POST /api/dtc/final-select error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.post('/blacklist', requireRole('dtc', ROLES.DTC_COMMITTEE), async (req, res) => {
  const pool = getPgPool();
  try {
    const { company_name, company_type, remarks, performed_by } = req.body;

    if (!company_name || !String(company_name).trim()) {
      return res.status(400).json({ error: 'company_name is required.' });
    }
    const typeUpper = (company_type || '').toUpperCase().trim();
    if (!['MANUFACTURER', 'MARKETER'].includes(typeUpper)) {
      return res.status(400).json({ error: 'company_type must be MANUFACTURER or MARKETER.' });
    }
    if (!performed_by) {
      return res.status(400).json({ error: 'performed_by is required.' });
    }

    // Role protection: only DTCCommittee/DTC
    const roleCheck = await pool.query(
      `SELECT role FROM users WHERE user_id = $1 AND is_active = true`, [performed_by]
    );
    const userRole = roleCheck.rows[0] ? (roleCheck.rows[0].role || '').toLowerCase().trim() : '';
    if (!roleCheck.rows.length || (userRole !== ROLES.DTC_COMMITTEE && userRole !== 'dtc')) {
      return res.status(403).json({ error: 'Access denied. Only DTC Committee members can manage the blacklist.' });
    }

    const normalizedName = String(company_name).trim().toUpperCase();

    // Duplicate prevention
    const dupCheck = await pool.query(
      `SELECT blacklist_id FROM blacklisted_companies
       WHERE is_active = true
         AND UPPER(TRIM(company_name)) = $1
         AND company_type = $2`,
      [normalizedName, typeUpper]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Company is already blacklisted.' });
    }

    await pool.query(
      `INSERT INTO blacklisted_companies (company_name, company_type, remarks, created_by)
       VALUES ($1, $2, $3, $4)`,
      [normalizedName, typeUpper, remarks?.trim() || null, performed_by]
    );
    res.status(201).json({ message: `${typeUpper === 'MANUFACTURER' ? 'Manufacturer' : 'Marketer'} "${normalizedName}" added to blacklist.` });
  } catch (err) {
    console.error('POST /api/dtc/blacklist error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.get('/blacklist', requireRole('dtc', ROLES.DTC_COMMITTEE), async (req, res) => {
  const pool = getPgPool();
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id query param is required.' });

    // Role protection: only DTCCommittee/DTC
    const roleCheck = await pool.query(
      `SELECT role FROM users WHERE user_id = $1 AND is_active = true`, [userId]
    );
    const userRole = roleCheck.rows[0] ? (roleCheck.rows[0].role || '').toLowerCase().trim() : '';
    if (!roleCheck.rows.length || (userRole !== ROLES.DTC_COMMITTEE && userRole !== 'dtc')) {
      return res.status(403).json({ error: 'Access denied. Only DTC Committee members can view the blacklist.' });
    }

    const result = await pool.query(
      `SELECT bl.blacklist_id, bl.company_name, bl.company_type, bl.remarks,
              bl.is_active, bl.created_at, bl.removed_at,
              u.name AS created_by_name,
              ru.name AS removed_by_name
       FROM blacklisted_companies bl
       LEFT JOIN users u  ON u.user_id  = bl.created_by
       LEFT JOIN users ru ON ru.user_id = bl.removed_by
       WHERE bl.is_active = true
       ORDER BY bl.created_at DESC`
    );
    res.json(result.rows.map(upperKeys));
  } catch (err) {
    console.error('GET /api/dtc/blacklist error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.put('/blacklist/:id/remove', requireRole('dtc', ROLES.DTC_COMMITTEE), async (req, res) => {
  const pool = getPgPool();
  try {
    const blacklistId = parseInt(req.params.id);
    const { performed_by } = req.body;

    if (!performed_by) return res.status(400).json({ error: 'performed_by is required.' });

    // Role protection: only DTCCommittee/DTC
    const roleCheck = await pool.query(
      `SELECT role FROM users WHERE user_id = $1 AND is_active = true`, [performed_by]
    );
    const userRole = roleCheck.rows[0] ? (roleCheck.rows[0].role || '').toLowerCase().trim() : '';
    if (!roleCheck.rows.length || (userRole !== ROLES.DTC_COMMITTEE && userRole !== 'dtc')) {
      return res.status(403).json({ error: 'Access denied. Only DTC Committee members can manage the blacklist.' });
    }

    const exists = await pool.query(
      `SELECT blacklist_id, company_name FROM blacklisted_companies WHERE blacklist_id = $1 AND is_active = true`,
      [blacklistId]
    );
    if (!exists.rows.length) return res.status(404).json({ error: 'Blacklist entry not found or already removed.' });

    await pool.query(
      `UPDATE blacklisted_companies
         SET is_active = false, removed_by = $1, removed_at = CURRENT_TIMESTAMP
       WHERE blacklist_id = $2`,
      [performed_by, blacklistId]
    );
    res.json({ message: `Blacklist entry #${blacklistId} removed.` });
  } catch (err) {
    console.error('PUT /api/dtc/blacklist remove error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});


export default router;

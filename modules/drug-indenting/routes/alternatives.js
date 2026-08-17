// Alternatives + comparison-sheet routes — moved out of server.js
// unchanged, mounted at the API root (/api) since they span three
// different sub-prefixes (/api/alternatives, /api/pharmacist/*,
// /api/pharmacy-head/*) that don't share one clean mount point.
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style conventions used app-wide.
//
// Real, file-specific decisions:
//
// 1. Every executeMany() site here (4 total) has no other row depending
//    on another row's generated ID EXCEPT the pharmacy-head/comparison
//    route, which needs each new alt_id to insert its matching
//    negotiation row. For the no-dependency cases, a plain multi-row
//    `INSERT ... VALUES (...), (...), ...` is the direct one-round-trip
//    equivalent. For the one WITH a dependency, Postgres's `RETURNING`
//    on a multi-row VALUES INSERT returns rows in the same order the
//    VALUES were given (well-established practical Postgres behavior
//    for a plain INSERT with no ON CONFLICT/trigger complexity, though
//    not something the SQL standard formally guarantees) -- verified
//    directly with a real test that checks negotiation rows actually
//    end up linked to the CORRECT alternative by content, not just by
//    trusting the ordering assumption.
//
// 2. GET /alternatives/:requestId spreads raw rows directly, but
//    checking every consumer (PharmacistTab.js, PharmacyHeadTab.js,
//    DTCCommitteeTab.js) found they already defensively check BOTH
//    casings (`a.ALT_ID ?? a.alt_id`, `ed.BRAND_NAME ?? ed.brand_name`)
//    -- unlike the several previous files where a consumer depended on
//    ONE casing with no fallback. So this response is sent as natural
//    lowercase from Postgres, no upperKeys() needed here, unlike
//    pharmacistDrafts.js/users.js/admin.js/dtc.js/misc.js.
//
// 3. GET /alternatives/:requestId/selected already hand-builds its
//    entire response from scratch (final_brand_name, dtc_selected_
//    category, etc. -- never spread from a raw row), so its OUTGOING
//    shape needed no casing changes at all -- only the internal
//    property reads off query results (`dr.REQUEST_BRAND_NAME` etc.)
//    needed to become lowercase.

import express from 'express';
import { getPgPool } from '../db/pgPool.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import { computeAltDerived, formatEffectiveEntryRow } from '../utils/pureHelpers.js';
import { writeAudit, createNotificationsBulk } from '../utils/auditHelpersPg.js';
import { ROLES } from '../utils/workflow.js';

const router = express.Router();

// Shared multi-row VALUES builder for the drug_alternatives insert shape
// used by both /alternatives/:requestId and /pharmacy-head/comparison/:requestId
// -- 25 columns per row, built once here rather than duplicated twice.
function buildAltInsert(alternatives, requestId, performedBy, defaultComparisonType) {
  const values = [];
  const tuples = alternatives.map((alt, i) => {
    const d = computeAltDerived(alt);
    const base = i * 25;
    values.push(
      requestId,
      alt.brand_name || null,
      alt.manufacturer || null,
      alt.marketer || null,
      parseFloat(alt.mrp_per_pack) || null,
      parseFloat(alt.rate_per_pack) || null,
      parseFloat(alt.gst_percent) || null,
      d.mrp || null,
      d.rate || null,
      parseFloat(alt.qty) || null,
      parseFloat(alt.offer) || null,
      d.markup_margin || null,
      d.net_rate || null,
      d.absolute_margin || null,
      parseFloat(alt.negorate) || null,
      d.profit_margin || null,
      alt.stock || null,
      parseFloat(alt.purchase_qty) || null,
      alt.consultant || null,
      parseFloat(alt.sale_qty) || null,
      alt.pack ? String(alt.pack) : null,
      alt.introduced_on || 'New Item',
      alt.comparison_type || defaultComparisonType,
      alt.remark || null,
      alt.submitted_by || performedBy
    );
    const p = Array.from({ length: 25 }, (_, j) => `$${base + j + 1}`);
    return `(${p.join(', ')})`;
  });
  return { values, tuplesSql: tuples.join(', ') };
}

const ALT_INSERT_COLUMNS = `
  request_id,
  brand_name, manufacturer, marketer,
  mrp_per_pack, rate_per_pack, gst_percent,
  mrp, rate, qty, offer,
  markup_margin,
  net_rate,
  absolute_margin,
  negotiated_rate,
  profit_margin,
  stock,
  purchase_quantity,
  consultant, sale_qty, pack, introduced_on,
  comparison_type,
  remark,
  submitted_by
`;

router.post('/alternatives/:requestId', requireRole(ROLES.PHARMACIST), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.requestId);
    const { alternatives, comparison_type, remarks, existing_generic_data } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    if (!alternatives || alternatives.length < 1) {
      return res.status(400).json({ error: 'Minimum 3 alternatives are required.' });
    }

    const reqResult = await pool.query(
      `SELECT * FROM drug_requests WHERE request_id = $1`, [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });
    const dr = reqResult.rows[0];

    // Replace any prior submission
    await pool.query(`DELETE FROM drug_alternatives WHERE request_id = $1`, [requestId]);

    if (alternatives.length > 0) {
      const alts = alternatives.map(alt => ({ ...alt, comparison_type: comparison_type || alt.comparison_type }));
      const { values, tuplesSql } = buildAltInsert(alts, requestId, performed_by, 'new_generic');
      await pool.query(
        `INSERT INTO drug_alternatives (${ALT_INSERT_COLUMNS}) VALUES ${tuplesSql}`,
        values
      );
    }

    // Save existing generic master data on the request (once, not per-alternative)
    const egdJson = existing_generic_data ? JSON.stringify(existing_generic_data) : null;
    await pool.query(
      `UPDATE drug_requests SET existing_generic_data = $1 WHERE request_id = $2`,
      [egdJson, requestId]
    );

    // Preserve the pass-1 Initial Review remark if pass-2 is submitted with
    // this box left blank (the common case -- the frontend doesn't pre-fill
    // it) -- an unconditional overwrite here was silently wiping out the
    // pharmacist's pass-1 remark the moment they submitted pass-2, matching
    // the correction-resubmit route's existing safe pattern.
    await pool.query(
      `UPDATE drug_requests SET current_stage = 'PharmacyHeadReview2',
         pharmacist_remarks = CASE WHEN $1::text IS NOT NULL THEN $1 ELSE pharmacist_remarks END,
         updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $2`,
      [remarks || null, requestId]
    );
    await writeAudit(pool, requestId, 'ALTERNATIVES_SUBMITTED', performed_by, 'Pharmacist', 'PharmacyHeadReview2', remarks);

    const phUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACYHEAD' AND is_active = true`
    );
    await createNotificationsBulk(pool, phUsers.rows.map(r => Number(r.user_id)), requestId,
      `Pharmacist submitted ${alternatives.length} alternatives for request #${requestId} (${dr.brand_name}). Please review.`
    );

    // Clean up any saved draft for this request (submission is final)
    await pool.query(
      `DELETE FROM analysis_drafts WHERE request_id = $1 AND pharmacist_id = $2 AND status = 'DRAFT'`,
      [requestId, performed_by]
    );

    res.json({ message: 'Alternatives submitted. Forwarded to Pharmacy Head.' });

  } catch (err) {
    console.error('POST /api/alternatives error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.post('/pharmacist/correction-submit/:requestId', requireRole(ROLES.PHARMACIST), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.requestId);
    const {
      alternatives,
      comparison_type,
      remarks,
      existing_generic_data
    } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    if (!alternatives || alternatives.length < 1) {
      return res.status(400).json({ error: 'Minimum 1 alternative is required for correction.' });
    }

    // Validate request exists and is in PharmacistCorrection stage
    const reqResult = await pool.query(
      `SELECT * FROM drug_requests WHERE request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    const dr = reqResult.rows[0];
    if (dr.current_stage !== 'PharmacistCorrection') {
      return res.status(400).json({ error: 'Resubmit is only allowed from Pharmacist Correction stage.' });
    }

    // Delete old alternatives
    await pool.query(
      `DELETE FROM drug_alternatives WHERE request_id = $1`,
      [requestId]
    );

    // Insert corrected alternatives -- was a real per-row loop already in
    // the Oracle version (not previously batched here, unlike the sibling
    // routes in this file); converted to the same one-round-trip
    // multi-row INSERT used everywhere else in this file for consistency,
    // a real improvement, not required to match prior behavior.
    if (alternatives.length > 0) {
      const alts = alternatives.map(alt => ({ ...alt, comparison_type: comparison_type || alt.comparison_type }));
      const { values, tuplesSql } = buildAltInsert(alts, requestId, performed_by, 'new_generic');
      await pool.query(
        `INSERT INTO drug_alternatives (${ALT_INSERT_COLUMNS}) VALUES ${tuplesSql}`,
        values
      );
    }

    // Save existing generic data and update request workflow
    const egdJson = existing_generic_data ? JSON.stringify(existing_generic_data) : null;
    await pool.query(
      `UPDATE drug_requests
       SET
         pharmacist_remarks = $1,
         existing_generic_data = $2,
         current_stage = 'PharmacyHeadReview2',
         status = 'Pending',
         is_reverted = false,
         revert_remarks = NULL,
         last_corrected_at = CURRENT_TIMESTAMP,
         last_corrected_by = $3,
         updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $4`,
      [remarks || null, egdJson, performed_by, requestId]
    );

    // Audit log
    await writeAudit(
      pool,
      requestId,
      'CORRECTION_RESUBMITTED',
      performed_by,
      'PharmacistCorrection',
      'PharmacyHeadReview2',
      remarks || 'Corrected comparison sheet re-submitted to Pharmacy Head.'
    );

    // Notify Pharmacy Head users
    const phUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACYHEAD' AND is_active = true`
    );
    await createNotificationsBulk(
      pool,
      phUsers.rows.map(r => Number(r.user_id)),
      requestId,
      `✅ Corrected comparison sheet for Request #${requestId} (${dr.brand_name}) has been resubmitted by Pharmacist. Please review.`
    );

    // Clean up analysis drafts
    await pool.query(
      `DELETE FROM analysis_drafts WHERE request_id = $1 AND pharmacist_id = $2 AND status = 'DRAFT'`,
      [requestId, performed_by]
    );

    res.json({
      success: true,
      message: 'Correction submitted successfully.'
    });

  } catch (err) {
    console.error('POST /api/pharmacist/correction-submit error:', err);
    res.status(500).json({ error: 'Correction resubmission failed.', detail: err.message });
  }
});

router.get('/alternatives/:requestId', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT da.alt_id, da.request_id, da.brand_name, da.manufacturer, da.marketer,
              da.mrp_per_pack, da.rate_per_pack, da.gst_percent, da.mrp, da.rate,
              da.qty, da.offer, da.markup_margin, da.scheme_qty, da.scheme_offer,
              da.net_rate, da.total_margin, da.profit_margin, da.absolute_margin,
              da.stock, da.existing_drug_details, da.remark, da.refer,
              da.submitted_by, da.created_at, da.is_final_selected,
              da.consultant, da.sale_qty, da.pack, da.introduced_on,
              da.comparison_type,
              u.name AS submitted_by_name,
              dn.negotiation_id, dn.negotiated_mrp, dn.negotiated_rate, dn.negotiated_gst,
              dn.negotiated_scheme_qty, dn.negotiated_scheme_offer, dn.negotiated_net_rate,
              dn.negotiated_profit_margin, dn.negotiated_absolute_margin, dn.negotiated_total_margin,
              dn.negotiation_remarks
       FROM drug_alternatives da
       LEFT JOIN users u ON u.user_id = da.submitted_by
       LEFT JOIN drug_alternative_negotiations dn ON dn.alternative_id = da.alt_id
       WHERE da.request_id = $1 ORDER BY da.alt_id ASC`,
      [req.params.requestId]
    );

    const edResult = await pool.query(
      `SELECT * FROM drug_existing_details WHERE request_id = $1 ORDER BY row_no ASC`,
      [req.params.requestId]
    );

    const entriesResult = await pool.query(
      `SELECT * FROM drug_effective_entries WHERE request_id = $1 ORDER BY entry_id ASC`,
      [req.params.requestId]
    );

    const reqResult = await pool.query(
      `SELECT dtc_reviewed_by_name, dtc_review_signature,
              final_selected_brand, final_selected_category,
              final_selection_reasons, final_recommendation_notes,
              ph_final_recommendation, dtc_final_recommendations
       FROM drug_requests WHERE request_id = $1`,
      [req.params.requestId]
    );
    const reqRow = reqResult.rows[0] || {};

    res.json({
      alternatives: result.rows,
      existing_details: edResult.rows,
      effective_drug_entries: entriesResult.rows.map(row => formatEffectiveEntryRow(row)),
      dtc_reviewed_by_name: reqRow.dtc_reviewed_by_name || '',
      dtc_review_signature: reqRow.dtc_review_signature || '',
      final_selected_brand: reqRow.final_selected_brand || '',
      final_selected_category: reqRow.final_selected_category || '',
      final_selection_reasons: reqRow.final_selection_reasons || '',
      final_recommendation_notes: reqRow.final_recommendation_notes || '',
      ph_final_recommendation: reqRow.ph_final_recommendation || '',
      dtc_final_recommendations: reqRow.dtc_final_recommendations || ''
    });
  } catch (err) {
    console.error('GET /api/alternatives error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.get('/alternatives/:requestId/selected', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.requestId);

    const drResult = await pool.query(
      `SELECT dr.final_selected_alternative_id,
              dr.dtc_selected_brand,
              dr.dtc_selected_category,
              dr.dtc_selection_reasons,
              dr.dtc_recommendation_notes,
              dr.dtc_reviewed_by_name,
              dr.dtc_review_signature,
              dr.ph_final_recommendation,
              dr.generic_name AS request_generic_name,
              dr.brand_name AS request_brand_name,
              dr.manufacturer AS request_manufacturer,
              dr.marketer AS request_marketer,
              dr.dosage_form AS request_dosage_form,
              dr.dose_strength AS request_dose_strength,
              dr.dtc_final_recommendations,
              dr.existing_generic_data,
              dr.final_selected_brand,
              dr.final_selected_category,
              dr.final_selection_reasons,
              dr.final_recommendation_notes
       FROM drug_requests dr
       WHERE dr.request_id = $1`,
      [requestId]
    );

    if (!drResult.rows.length) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    const dr = drResult.rows[0];
    const final_selected_alternative_id = dr.final_selected_alternative_id !== null ? Number(dr.final_selected_alternative_id) : null;

    // Resolve original brand details (mrp, rate, stock, purchase_qty) dynamically
    let origMrp = '';
    let origRate = '';
    let origStock = '';
    let origQty = '';
    try {
      const origAltResult = await pool.query(
        `SELECT mrp_per_pack, rate_per_pack, stock, purchase_quantity
         FROM drug_alternatives
         WHERE request_id = $1 AND LOWER(brand_name) = LOWER($2)`,
        [requestId, dr.request_brand_name]
      );
      if (origAltResult.rows.length) {
        origMrp = origAltResult.rows[0].mrp_per_pack;
        origRate = origAltResult.rows[0].rate_per_pack;
        origStock = origAltResult.rows[0].stock;
        origQty = origAltResult.rows[0].purchase_quantity;
      }
    } catch (altErr) {
      console.error('Error fetching original alternative details:', altErr);
    }

    if ((!origMrp || origMrp === '') && dr.existing_generic_data) {
      try {
        const egd = JSON.parse(dr.existing_generic_data);
        origMrp = egd.existing_mrp || egd.existing_mrp_inc_gst_nos || '';
        origRate = egd.existing_rate || egd.existing_rate_inc_gst_nos || '';
        origStock = egd.existing_stock || egd.existing_present_stock || '';
        origQty = egd.existing_purchase_qty || '';
      } catch (jsonEgdErr) {
        console.error('Error parsing existing_generic_data for selected original:', jsonEgdErr);
      }
    }

    let list = [];
    const recommendationsJson = dr.dtc_final_recommendations;
    if (recommendationsJson) {
      try {
        const recs = JSON.parse(recommendationsJson);

        // Was up to 2 SELECTs per recommendation (ID lookup + brand-name
        // fallback) -- batched into at most 2 SELECTs total, regardless of
        // how many recommendations there are. Same ID-first,
        // brand-name-fallback priority preserved via in-memory lookup maps.
        const ALT_COLS = `da.alt_id AS final_alt_id,
                        da.brand_name AS final_brand_name,
                        da.manufacturer AS final_manufacturer,
                        da.marketer AS final_marketer,
                        da.mrp AS final_mrp,
                        da.rate AS final_rate,
                        da.net_rate AS final_net_rate,
                        da.profit_margin AS final_profit_margin,
                        da.absolute_margin AS final_absolute_margin,
                        da.scheme_qty AS final_scheme_qty,
                        da.scheme_offer AS final_scheme_offer,
                        da.pack AS final_pack,
                        da.remark,
                        dn.negotiated_mrp, dn.negotiated_rate, dn.negotiated_gst,
                        dn.negotiated_scheme_qty, dn.negotiated_scheme_offer, dn.negotiated_net_rate,
                        dn.negotiated_profit_margin, dn.negotiated_absolute_margin, dn.negotiated_total_margin,
                        dn.negotiation_remarks`;

        const altRecs = recs.filter(rec => !rec.is_original);
        const byAltId = new Map();
        const byBrandName = new Map();

        const altIds = [...new Set(altRecs.filter(rec => rec.alternative_id).map(rec => rec.alternative_id))];
        if (altIds.length > 0) {
          const idRes = await pool.query(
            `SELECT ${ALT_COLS}
             FROM drug_alternatives da
             LEFT JOIN drug_alternative_negotiations dn ON dn.alternative_id = da.alt_id
             WHERE da.request_id = $1 AND da.alt_id = ANY($2::bigint[])`,
            [requestId, altIds]
          );
          idRes.rows.forEach(row => byAltId.set(Number(row.final_alt_id), row));
        }

        // Brand-name fallback only for recs whose ID lookup found nothing
        // (or that never had an ID -- legacy records)
        const needsBrandFallback = altRecs.filter(rec =>
          rec.brand_name && (!rec.alternative_id || !byAltId.has(rec.alternative_id))
        );
        const brandNames = [...new Set(needsBrandFallback.map(rec => rec.brand_name.toLowerCase()))];
        if (brandNames.length > 0) {
          const nameRes = await pool.query(
            `SELECT ${ALT_COLS}
             FROM drug_alternatives da
             LEFT JOIN drug_alternative_negotiations dn ON dn.alternative_id = da.alt_id
             WHERE da.request_id = $1 AND LOWER(da.brand_name) = ANY($2::text[])
             ORDER BY da.alt_id ASC`,
            [requestId, brandNames]
          );
          // Keep only the first (lowest alt_id) match per brand name, matching
          // the original single-row FETCH FIRST 1 ROWS ONLY behavior.
          nameRes.rows.forEach(row => {
            const key = row.final_brand_name.toLowerCase();
            if (!byBrandName.has(key)) byBrandName.set(key, row);
          });
        }

        for (const rec of recs) {
          if (rec.is_original) {
            list.push({
              type: 'original',
              brand_name: rec.brand_name || dr.request_brand_name,
              manufacturer: dr.request_manufacturer,
              marketer: dr.request_marketer,
              mrp: origMrp || '',
              rate: origRate || '',
              net_rate: origRate || '',
              profit_margin: '',
              absolute_margin: '',
              scheme_qty: '',
              scheme_offer: '',
              pack: `${dr.request_dose_strength} ${dr.request_dosage_form}`,
              stock: origStock || '',
              purchase_qty: origQty || '',
              category: rec.category,
              reasons: rec.reasons,
              notes: rec.notes,
              remarks: rec.remarks || ''
            });
          } else {
            const alt = (rec.alternative_id && byAltId.get(rec.alternative_id))
              || (rec.brand_name && byBrandName.get(rec.brand_name.toLowerCase()))
              || null;
            if (alt) {
              list.push({
                type: 'alternative',
                alternative_id: rec.alternative_id || Number(alt.final_alt_id),
                brand_name: rec.brand_name || alt.final_brand_name,
                manufacturer: alt.final_manufacturer || rec.manufacturer,
                marketer: alt.final_marketer || rec.marketer,
                mrp: alt.negotiated_mrp ?? alt.final_mrp,
                rate: alt.negotiated_rate ?? alt.final_rate,
                net_rate: alt.negotiated_net_rate ?? alt.final_net_rate,
                profit_margin: alt.negotiated_profit_margin ?? alt.final_profit_margin,
                absolute_margin: alt.negotiated_absolute_margin ?? alt.final_absolute_margin,
                scheme_qty: alt.negotiated_scheme_qty ?? alt.final_scheme_qty,
                scheme_offer: alt.negotiated_scheme_offer ?? alt.final_scheme_offer,
                pack: alt.final_pack,
                remark: alt.negotiation_remarks ?? alt.remark,
                category: rec.category,
                reasons: rec.reasons,
                notes: rec.notes,
                remarks: rec.remarks || '',
                // Negotiated fields for downstream use
                negotiated_mrp: alt.negotiated_mrp,
                negotiated_rate: alt.negotiated_rate,
                negotiated_gst: alt.negotiated_gst,
                negotiated_scheme_qty: alt.negotiated_scheme_qty,
                negotiated_scheme_offer: alt.negotiated_scheme_offer,
                negotiation_remarks: alt.negotiation_remarks
              });
            }
          }
        }
      } catch (jsonErr) {
        console.error('JSON parse error on dtc_final_recommendations:', jsonErr);
      }
    }


    // Fallback for legacy requests
    if (list.length === 0) {
      if (final_selected_alternative_id) {
        const altResult = await pool.query(
          `SELECT da.brand_name AS final_brand_name,
                  da.manufacturer AS final_manufacturer,
                  da.marketer AS final_marketer,
                  da.mrp AS final_mrp,
                  da.rate AS final_rate,
                  da.net_rate AS final_net_rate,
                  da.profit_margin AS final_profit_margin,
                  da.absolute_margin AS final_absolute_margin,
                  da.scheme_qty AS final_scheme_qty,
                  da.scheme_offer AS final_scheme_offer,
                  da.pack AS final_pack,
                  dn.negotiated_mrp, dn.negotiated_rate, dn.negotiated_gst,
                  dn.negotiated_scheme_qty, dn.negotiated_scheme_offer, dn.negotiated_net_rate,
                  dn.negotiated_profit_margin, dn.negotiated_absolute_margin, dn.negotiated_total_margin,
                  dn.negotiation_remarks
           FROM drug_alternatives da
           LEFT JOIN drug_alternative_negotiations dn ON dn.alternative_id = da.alt_id
           WHERE da.alt_id = $1 AND da.request_id = $2`,
          [final_selected_alternative_id, requestId]
        );
        if (altResult.rows.length) {
          const alt = altResult.rows[0];
          list.push({
            type: 'alternative',
            alternative_id: final_selected_alternative_id,
            brand_name: alt.final_brand_name,
            manufacturer: alt.final_manufacturer,
            marketer: alt.final_marketer,
            mrp: alt.negotiated_mrp ?? alt.final_mrp,
            rate: alt.negotiated_rate ?? alt.final_rate,
            net_rate: alt.negotiated_net_rate ?? alt.final_net_rate,
            profit_margin: alt.negotiated_profit_margin ?? alt.final_profit_margin,
            absolute_margin: alt.negotiated_absolute_margin ?? alt.final_absolute_margin,
            scheme_qty: alt.negotiated_scheme_qty ?? alt.final_scheme_qty,
            scheme_offer: alt.negotiated_scheme_offer ?? alt.final_scheme_offer,
            pack: alt.final_pack,
            category: dr.dtc_selected_category,
            reasons: dr.dtc_selection_reasons ? JSON.parse(dr.dtc_selection_reasons) : [],
            notes: dr.dtc_recommendation_notes,
            // Add negotiated fields
            negotiated_mrp: alt.negotiated_mrp,
            negotiated_rate: alt.negotiated_rate,
            negotiated_gst: alt.negotiated_gst,
            negotiated_scheme_qty: alt.negotiated_scheme_qty,
            negotiated_scheme_offer: alt.negotiated_scheme_offer,
            negotiation_remarks: alt.negotiation_remarks
          });
        }
      } else if (dr.dtc_selected_brand && dr.dtc_selected_brand.trim().toUpperCase() !== 'DTC REVIEWED') {
        // 'DTC Reviewed' is a placeholder label routes/dtc.js stores when DTC
        // finalizes without marking any alternative Recommended -- it's a
        // human-readable summary, not a real brand name, and must never be
        // treated as one here (real case: request #883, all 3 alternatives
        // "Not Recommended", dtc_final_recommendations was an empty array).
        list.push({
          type: 'original',
          brand_name: dr.dtc_selected_brand,
          manufacturer: dr.request_manufacturer,
          marketer: dr.request_marketer,
          mrp: origMrp || '',
          rate: origRate || '',
          net_rate: origRate || '',
          profit_margin: '',
          absolute_margin: '',
          scheme_qty: '',
          scheme_offer: '',
          pack: `${dr.request_dose_strength} ${dr.request_dosage_form}`,
          stock: origStock || '',
          purchase_qty: origQty || '',
          category: dr.dtc_selected_category,
          reasons: dr.dtc_selection_reasons ? JSON.parse(dr.dtc_selection_reasons) : [],
          notes: dr.dtc_recommendation_notes
        });
      }
    }

    if (list.length === 0) {
      return res.status(404).json({ error: 'final selection not found' });
    }

    // ── Build final_drugs: one normalized object per genuinely-Recommended
    // entry -- DTC can mark more than one alternative (or the original)
    // Recommended, and the Pharmacist Pending-Orders view needs to show all
    // of them, not silently collapse to a single arbitrary pick (real cases:
    // requests #744, #761, #781, #801, each with 1-4 Recommended entries).
    const finalGenericName = dr.request_generic_name || '';

    // NUMERIC columns (mrp, rate, margins, etc.) come back from
    // node-postgres as strings, not numbers -- unlike Oracle's NUMBER,
    // which oracledb always returned as a real number. Display-only in
    // every consumer checked (client/src/components/PharmacistTab.js,
    // PharmacyHeadTab.js -- template-literal/String() usage, no
    // arithmetic), but "150" vs "150.00" is still a real, visible
    // difference a real user would notice -- Number() here for that
    // reason, not because anything would silently break.
    const num = (v) => (v != null ? Number(v) : null);
    const normalizeEntry = (entry) => ({
      final_brand_name: entry.brand_name || '',
      final_generic_name: finalGenericName,
      final_manufacturer: entry.manufacturer || '',
      final_marketer: entry.marketer || '',
      final_mrp: num(entry.mrp),
      final_rate: num(entry.rate),
      final_net_rate: num(entry.net_rate),
      final_profit_margin: num(entry.profit_margin),
      final_absolute_margin: num(entry.absolute_margin),
      final_scheme_qty: num(entry.scheme_qty),
      final_scheme_offer: entry.scheme_offer || '',
      final_pack: entry.pack || '',
      dtc_selected_category: entry.category || dr.dtc_selected_category || '',
      dtc_recommendation_notes: entry.notes || dr.dtc_recommendation_notes || '',
      dtc_reviewed_by_name: dr.dtc_reviewed_by_name || '',
      dtc_review_signature: dr.dtc_review_signature || '',
      ph_final_recommendation: dr.ph_final_recommendation || '',
      dtc_selection_reasons: entry.reasons || [],
    });

    // Alternative-type entries: prefer the live-recomputed item.remark (see
    // line ~603) over the possibly-stale stored `remarks`, so this stays
    // self-healing for requests already sitting on a malformed array from
    // before ComparisonSheet.js's buildAutoRecommendations() fix. Original-type
    // entries only carry the stored `remarks` (no live equivalent is fetched
    // for the original row here), so that's the only check available for them.
    const isRecommended = (item) => item.type === 'alternative'
      ? item.remark === 'Recommended'
      : item.remarks === 'Recommended';

    const recommendedEntries = list.filter(isRecommended);
    let final_drugs = recommendedEntries.map(normalizeEntry);

    if (final_drugs.length === 0) {
      // Nothing on the array qualifies as genuinely Recommended (e.g. an old
      // malformed array with no entry actually marked Recommended by either
      // remark field) -- fall back to the previous single-pick behavior so
      // this never regresses to showing nothing at all.
      const fallbackEntry = list.find(item => item.type === 'alternative') || list.find(item => item.type === 'original');
      if (fallbackEntry) {
        final_drugs = [normalizeEntry(fallbackEntry)];
      } else {
        // 'DTC Reviewed' is the same placeholder label as above -- never a
        // real brand, so it must not become fallbackBrand here either (real
        // case: request #883, where both FINAL_SELECTED_BRAND and
        // DTC_SELECTED_BRAND held this placeholder, not an actual drug).
        const isPlaceholderBrand = (name) => !name || name.trim().toUpperCase() === 'DTC REVIEWED';
        const fallbackBrand = !isPlaceholderBrand(dr.final_selected_brand) ? dr.final_selected_brand
          : !isPlaceholderBrand(dr.dtc_selected_brand) ? dr.dtc_selected_brand
          : '';
        if (fallbackBrand) {
          let parsedReasons = [];
          try { parsedReasons = dr.final_selection_reasons ? JSON.parse(dr.final_selection_reasons) : []; } catch (_) { }
          final_drugs = [{
            final_brand_name: fallbackBrand,
            final_generic_name: finalGenericName,
            final_manufacturer: dr.request_manufacturer || '',
            final_marketer: dr.request_marketer || '',
            final_mrp: null,
            final_rate: null,
            final_net_rate: null,
            final_profit_margin: null,
            final_absolute_margin: null,
            final_scheme_qty: null,
            final_scheme_offer: '',
            final_pack: `${dr.request_dose_strength || ''} ${dr.request_dosage_form || ''}`.trim(),
            dtc_selected_category: dr.final_selected_category || dr.dtc_selected_category || '',
            dtc_recommendation_notes: dr.final_recommendation_notes || dr.dtc_recommendation_notes || '',
            dtc_reviewed_by_name: dr.dtc_reviewed_by_name || '',
            dtc_review_signature: dr.dtc_review_signature || '',
            ph_final_recommendation: dr.ph_final_recommendation || '',
            dtc_selection_reasons: parsedReasons,
          }];
        }
        // else: DTC finalized without marking any drug Recommended and left
        // no real brand anywhere to fall back to -- final_drugs stays empty,
        // and the frontend correctly shows "not available yet" rather than
        // a fabricated card.
      }
    }

    return res.json({
      type: 'multi',
      recommendations: list,
      final_drugs,
      final_drug: final_drugs[0], // back-compat alias for any other/future single-object consumer
    });

  } catch (err) {
    console.error('GET /api/alternatives/selected error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.put('/pharmacist/comparison/:requestId', requireRole(ROLES.PHARMACIST), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.requestId);
    const { existing_details } = req.body;

    if (!Array.isArray(existing_details)) {
      return res.status(400).json({ error: 'existing_details must be an array.' });
    }

    // Delete existing generic details rows for this request
    await pool.query(
      `DELETE FROM drug_existing_details WHERE request_id = $1`,
      [requestId]
    );

    // Insert new rows -- was one INSERT per row (N round trips), no row
    // depends on another's generated ID, so this batches cleanly into a
    // single multi-row INSERT.
    if (existing_details.length > 0) {
      const values = [];
      const tuples = existing_details.map((row, i) => {
        const base = i * 21;
        values.push(
          requestId,
          i + 1,
          row.introduced_on || null,
          row.brand_name || null,
          row.manufacturer || null,
          row.marketer || null,
          row.consultant || null,
          parseFloat(row.present_stock) || null,
          parseFloat(row.purchase_qty) || null,
          parseFloat(row.sale_qty) || null,
          row.pack ? String(row.pack) : null,
          parseFloat(row.mrp_inc_gst_nos) || null,
          parseFloat(row.rate_inc_gst_nos) || null,
          parseFloat(row.markup_margin) || null,
          parseFloat(row.scheme_qty) || null,
          row.scheme_offer ? String(row.scheme_offer) : null,
          parseFloat(row.net_rate) || null,
          parseFloat(row.profit_margin) || null,
          parseFloat(row.absolute_margin) || null,
          parseFloat(row.total_margin) || null,
          row.remark || null
        );
        const p = Array.from({ length: 21 }, (_, j) => `$${base + j + 1}`);
        return `(${p.join(', ')})`;
      });

      await pool.query(
        `INSERT INTO drug_existing_details (
          request_id, row_no, introduced_on, brand_name, manufacturer, marketer, consultant,
          present_stock, purchase_qty, sale_qty, pack,
          mrp_inc_gst_nos, rate_inc_gst_nos, markup_margin,
          scheme_qty, scheme_offer, net_rate, profit_margin, absolute_margin, total_margin, remark
        ) VALUES ${tuples.join(', ')}`,
        values
      );
    }

    res.json({ message: 'Existing drug details saved successfully.' });
  } catch (err) {
    console.error('PUT /api/pharmacist/comparison error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.put('/pharmacy-head/comparison/:requestId', requireRole(ROLES.PHARMACY_HEAD), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.requestId);
    const { alternatives, existing_generic_data, ph_review2_remarks, ph_review_remarks, dtc_recommendation_notes, ph_final_recommendation } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    if (!alternatives || !Array.isArray(alternatives)) {
      return res.status(400).json({ error: 'alternatives array is required.' });
    }

    // Verify request exists and is at PharmacyHeadReview2
    const reqRes = await pool.query(
      `SELECT request_id, current_stage, brand_name FROM drug_requests WHERE request_id = $1`,
      [requestId]
    );
    if (!reqRes.rows.length) return res.status(404).json({ error: 'Request not found.' });
    if (reqRes.rows[0].current_stage !== 'PharmacyHeadReview2') {
      return res.status(400).json({ error: 'Request is not at PharmacyHeadReview2 stage.' });
    }

    // comparison_type is a sheet-level choice the pharmacist makes once
    // (New Generic vs Existing Generic), not something Pharmacy Head's edit
    // form necessarily round-trips on every alternative row it PUTs back.
    // This used to default any row missing it straight to 'existing_generic'
    // - silently flipping a "New Generic" sheet to "Existing Generic" (and
    // making the Existing Details table reappear) on every Pharmacy Head
    // save. Fall back to whatever's already stored for this request instead
    // of a hardcoded value, so a save that omits the field preserves it.
    const existingTypeRes = await pool.query(
      `SELECT comparison_type FROM drug_alternatives WHERE request_id = $1 AND comparison_type IS NOT NULL LIMIT 1`,
      [requestId]
    );
    const storedComparisonType = existingTypeRes.rows[0]?.comparison_type || 'existing_generic';

    // Delete and re-insert alternatives (full replacement)
    await pool.query(`DELETE FROM drug_alternatives WHERE request_id = $1`, [requestId]);

    // Was 2 round trips PER alternative (insert alternative + insert its
    // negotiation row) -- the negotiation insert needs the alt_id the
    // alternative insert just generated. Postgres's RETURNING on a
    // multi-row VALUES INSERT gives back the new alt_ids in the same
    // order the VALUES were given (real, practically-reliable Postgres
    // behavior for a plain INSERT -- verified with a real test that
    // checks negotiation rows end up linked to the correct alternative
    // by content, not just trusting the ordering). 2N round trips -> 2,
    // regardless of how many alternatives there are.
    if (alternatives.length > 0) {
      const alts = alternatives.map(alt => ({ ...alt, comparison_type: alt.comparison_type || storedComparisonType }));
      const { values, tuplesSql } = buildAltInsert(alts, requestId, performed_by, storedComparisonType);
      const altInsertResult = await pool.query(
        `INSERT INTO drug_alternatives (${ALT_INSERT_COLUMNS}) VALUES ${tuplesSql} RETURNING alt_id`,
        values
      );

      const newAltIds = altInsertResult.rows.map(r => Number(r.alt_id));

      const negValues = [];
      const negTuples = alternatives.map((alt, i) => {
        const nd = computeAltDerived({
          mrp_per_pack: alt.negotiated_mrp,
          rate_per_pack: alt.negotiated_rate,
          gst_percent: alt.negotiated_gst,
          pack: alt.pack,
          qty: alt.negotiated_scheme_qty,
          offer: alt.negotiated_scheme_offer,
          // fallbacks
          mrp: alt.negotiated_mrp_derived,
          rate: alt.negotiated_rate_derived,
          markupmargin: alt.negotiated_total_margin,
          profit_margin: alt.negotiated_profit_margin,
          margin: alt.negotiated_absolute_margin,
          net_rate: alt.negotiated_net_rate
        });
        const base = i * 12;
        negValues.push(
          newAltIds[i],
          parseFloat(alt.negotiated_mrp) || null,
          parseFloat(alt.negotiated_rate) || null,
          parseFloat(alt.negotiated_gst) || null,
          parseFloat(alt.negotiated_scheme_qty) || null,
          alt.negotiated_scheme_offer ? String(alt.negotiated_scheme_offer) : null,
          nd.net_rate || null,
          nd.profit_margin || null,
          nd.absolute_margin || null,
          nd.total_margin || null,
          performed_by,
          alt.negotiation_remarks || null
        );
        const p = Array.from({ length: 12 }, (_, j) => `$${base + j + 1}`);
        return `(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]}, ${p[4]}, ${p[5]}, ${p[6]}, ${p[7]}, ${p[8]}, ${p[9]}, ${p[10]}, CURRENT_TIMESTAMP, ${p[11]})`;
      });

      await pool.query(
        `INSERT INTO drug_alternative_negotiations (
           alternative_id,
           negotiated_mrp, negotiated_rate, negotiated_gst,
           negotiated_scheme_qty, negotiated_scheme_offer,
           negotiated_net_rate, negotiated_profit_margin,
           negotiated_absolute_margin, negotiated_total_margin,
           negotiated_by, negotiated_at, negotiation_remarks
         ) VALUES ${negTuples.join(', ')}`,
        negValues
      );
    }


    // Update existing_generic_data + ph_review2_remarks + ph_review_remarks + dtc_recommendation_notes on drug_requests
    const egdJson = existing_generic_data ? JSON.stringify(existing_generic_data) : null;
    await pool.query(
      `UPDATE drug_requests
         SET existing_generic_data = $1,
             ph_review2_remarks    = $2,
             ph_review_remarks     = $3,
             dtc_recommendation_notes = $4,
             ph_final_recommendation = $5,
             updated_at            = CURRENT_TIMESTAMP
       WHERE request_id = $6`,
      [
        egdJson,
        ph_review2_remarks || ph_review_remarks || null,
        ph_review_remarks || null,
        dtc_recommendation_notes || null,
        ph_final_recommendation || null,
        requestId,
      ]
    );

    await writeAudit(pool, requestId, 'PH_COMPARISON_UPDATED', performed_by, 'PharmacyHeadReview2', 'PharmacyHeadReview2', ph_review2_remarks || ph_review_remarks);
    res.json({ message: 'Comparison sheet updated by Pharmacy Head.' });
  } catch (err) {
    console.error('PUT /api/pharmacy-head/comparison error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});


export default router;

// Core drug-request workflow routes — moved out of server.js unchanged,
// mounted at /api/requests. This is the biggest route group: creation,
// viewing, and every stage of the approval workflow (approve/reject/
// review/pharmacist-submit/emergency/order-placement/inventory/revert/
// resubmit). Route order preserved exactly as it was — in particular,
// /:requestId/existing-generic-data must stay registered before
// /:role/:userId, since the latter's :userId wildcard would otherwise
// shadow it.
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style conventions used app-wide,
// and routes/dtc.js's header for the executeMany -> ANY(array)/
// UPDATE-FROM-VALUES/multi-row-INSERT-RETURNING conventions reused here.
//
// GET /:role/:userId spreads raw drug_requests rows directly, and this
// is the one response shape consumed by nearly every tab component in
// the app (PharmacistTab.js, CEOTab.js, DTCCommitteeTab.js, etc.) --
// every one already confirmed elsewhere this session to read
// req.REQUEST_ID/CURRENT_STAGE/BRAND_NAME etc. with no fallback. Same
// upperKeys() treatment as the last several conversions, applied here
// too rather than re-auditing every consumer of this most-shared shape
// individually.

import express from 'express';
import { getPgPool } from '../db/pgPool.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import { NEXT_STAGE, STAGE_LABELS, getApproverRoleForStage, ROLES, rolesMatch } from '../utils/workflow.js';
import { computeAltDerived, formatEffectiveEntryRow } from '../utils/pureHelpers.js';
import { writeAudit, createNotification, createNotificationsBulk, saveApprovalRemarks } from '../utils/auditHelpersPg.js';

const router = express.Router();

// drug_requests's BIGINT columns -- node-postgres returns these as
// strings, same bug class as every prior conversion's dbUserId/upperKeys
// fix. Caught here by a real test asserting typeof REQUEST_ID === 'number'
// (client code compares/keys on these, e.g. CEOTab.js's
// `irSelected?.REQUEST_ID === r.REQUEST_ID`).
const BIGINT_COLUMNS = new Set([
  'request_id', 'doctor_id', 'created_by_user_id', 'hod_id', 'dtc_reviewed_by',
  'final_selected_alternative_id', 'reverted_by', 'last_corrected_by',
  'inventory_added_by', 'inventory_received_by',
]);

function upperKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toUpperCase()] = BIGINT_COLUMNS.has(k) && v !== null ? Number(v) : v;
  }
  return out;
}

// Shared blacklist check -- same query used identically in POST /,
// POST /pharmacist, and POST /emergency.
async function checkBlacklist(pool, manufacturer, marketer) {
  const res = await pool.query(
    `SELECT company_type, remarks FROM blacklisted_companies
     WHERE is_active = true
       AND (
         (company_type = 'MANUFACTURER' AND UPPER(TRIM(company_name)) = UPPER(TRIM($1)))
         OR
         (company_type = 'MARKETER' AND UPPER(TRIM(company_name)) = UPPER(TRIM($2)))
       )
     FETCH FIRST 1 ROW ONLY`,
    [manufacturer || '', marketer || '']
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    type: row.company_type === 'MANUFACTURER' ? 'Manufacturer' : 'Marketer',
    remarks: row.remarks || '',
  };
}

router.post('/', requireAuth, async (req, res) => {
  const {
    doctor_id, med_rep_name, med_rep_email, med_rep_phone,
    request_type, formulary_request_type, category, request_source_type,
    brand_name, generic_name, dose_strength, dosage_form,
    manufacturer, marketer, existing_brands,
    clinical_justification, expected_patients_pm, cost_reduction_benefit,
    medicine_quantity, ai_content
  } = req.body;

  // Only doctors/HODs create requests, and only as themselves — without
  // this, any authenticated user's token could submit a request with an
  // arbitrary doctor_id, impersonating any doctor.
  if (![ROLES.DOCTOR, ROLES.HOD].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only doctors and HODs can submit drug requests.' });
  }
  if (req.user.id !== Number(doctor_id)) {
    return res.status(403).json({ error: 'You can only submit requests as yourself.' });
  }

  const pool = getPgPool();
  try {
    // Validate source type
    const sourceType = (request_source_type || 'PROMOTIONAL').toUpperCase();
    if (!['PROMOTIONAL', 'NON_PROMOTIONAL'].includes(sourceType)) {
      return res.status(400).json({ error: 'request_source_type must be PROMOTIONAL or NON_PROMOTIONAL.' });
    }

    const isPromotional = sourceType === 'PROMOTIONAL';
    let formatai = ai_content ? ai_content.replace(/\n/g, '<br>') : '';

    // Base required fields (always needed)
    const baseRequired = {
      doctor_id, request_type, formulary_request_type, category, brand_name, generic_name,
      dose_strength, dosage_form, manufacturer, marketer,
      clinical_justification, expected_patients_pm
    };

    // Validate medicine_quantity
    if (medicine_quantity !== undefined && medicine_quantity !== null && String(medicine_quantity).trim() !== '') {
      if (isNaN(Number(medicine_quantity)) || Number(medicine_quantity) <= 0) {
        return res.status(400).json({ error: `Field 'medicine_quantity' must be a positive number.` });
      }
    } else if (!isPromotional) {
      return res.status(400).json({ error: `Field 'medicine_quantity' is required for Non-Promotional requests.` });
    }
    for (const [key, val] of Object.entries(baseRequired)) {
      if (val === undefined || val === null || String(val).trim() === '') {
        return res.status(400).json({ error: `Field '${key}' is required.` });
      }
    }

    // Conditional: Med Rep fields required only for PROMOTIONAL
    if (isPromotional) {
      const repRequired = { med_rep_name, med_rep_email, med_rep_phone };
      for (const [key, val] of Object.entries(repRequired)) {
        if (!val || String(val).trim() === '') {
          return res.status(400).json({ error: `Field '${key}' is required for Promotional requests.` });
        }
      }
    }


    const qCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM user_request_quotas WHERE user_id = $1`,
      [doctor_id]
    );
    if (Number(qCheck.rows[0].cnt) === 0) {
      await pool.query(
        `INSERT INTO user_request_quotas (user_id, quarterly_limit, updated_by)
         VALUES ($1, 10, $1)`,
        [doctor_id]
      );
    }

    const quotaResult = await pool.query(
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
      [doctor_id]
    );
    const qRow = quotaResult.rows[0];
    const qLimit = qRow.quarterly_limit;
    const qUsed = Number(qRow.used_this_quarter);

    if (qUsed >= qLimit) {
      return res.status(400).json({
        success: false,
        error: 'Quarterly request quota exceeded.'
      });
    }

    // -- Blacklist validation --
    const blHit = await checkBlacklist(pool, manufacturer, marketer);
    if (blHit) {
      return res.status(400).json({
        success: false,
        error: `Request denied. ${blHit.type} is blacklisted by DTC.`,
        remarks: blHit.remarks
      });
    }

    // Fetch creator role, department & name to determine workflow and to
    // address notifications correctly (see notification-text fix below).
    const creatorRes = await pool.query(`SELECT role, department, name FROM users WHERE user_id = $1`, [doctor_id]);
    if (creatorRes.rows.length === 0) return res.status(400).json({ error: 'User not found.' });
    const creatorRole = creatorRes.rows[0].role;
    const creatorDept = creatorRes.rows[0].department;
    const creatorName = creatorRes.rows[0].name;

    // Initialize workflow variables
    let initialStatus = 'HOD_APPROVED';
    let initialStage = 'PharmacistInitialReview';
    let hodId = null;

    // Determine workflow based on role
    if (creatorRole && creatorRole.toLowerCase() === ROLES.DOCTOR) {
      // Only attempt HOD routing if the doctor has a department set
      if (creatorDept && creatorDept.trim() !== '') {
        const hodRes = await pool.query(
          `SELECT user_id FROM users WHERE UPPER(role) = 'HOD' AND UPPER(TRIM(department)) = UPPER(TRIM($1)) AND is_active = true`,
          [creatorDept.trim()]
        );
        if (hodRes.rows.length > 0) {
          // HOD found → route through HOD first
          hodId = Number(hodRes.rows[0].user_id);
          initialStatus = 'PENDING_HOD';
          initialStage = 'HOD';
        } else {
          // No HOD for this department → route to Pharmacist (Initial Review)
          console.warn(`[WARN] No HOD found for department '${creatorDept}'. Routing to PharmacistInitialReview.`);
          initialStatus = 'HOD_APPROVED';
          initialStage = 'PharmacistInitialReview';
        }
      } else {
        // Doctor has no department set → route to Pharmacist (Initial Review)
        console.warn(`[WARN] Doctor (user_id=${doctor_id}) has no department set. Routing to PharmacistInitialReview.`);
        initialStatus = 'HOD_APPROVED';
        initialStage = 'PharmacistInitialReview';
      }
    } else if (creatorRole && creatorRole.toLowerCase() === ROLES.HOD) {
      initialStatus = 'HOD_APPROVED';
      initialStage = 'PharmacistInitialReview';
    }

    const isHOD = creatorRole && creatorRole.toLowerCase() === ROLES.HOD;

    const insertResult = await pool.query(
      `INSERT INTO drug_requests (
         doctor_id, created_by_user_id, created_by_role, hod_id,
         med_rep_name, med_rep_email, med_rep_phone,
         request_type, formulary_request_type, category, request_source_type,
         brand_name, generic_name, dose_strength, dosage_form,
         manufacturer, marketer, existing_brands,
         clinical_justification, expected_patients_pm, cost_reduction_benefit,
         medicine_quantity, ai_content,
         status, current_stage,
         approved_by_hod, hod_action_timestamp
       ) VALUES (
         $1, $1, $2, $3,
         $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17,
         $18, $19, $20,
         $21, $22,
         $23, $24,
         $25, $26
       ) RETURNING request_id`,
      [
        doctor_id,
        creatorRole,
        hodId,
        // Full rep details are allowed (optional) for a clinician-initiated
        // request too -- same form as the promotional flow, just not
        // required. Only PROMOTIONAL still enforces these as mandatory
        // (validated above); here we simply save whatever was given.
        med_rep_name && String(med_rep_name).trim() !== '' ? med_rep_name : null,
        med_rep_email && String(med_rep_email).trim() !== '' ? med_rep_email : null,
        med_rep_phone && String(med_rep_phone).trim() !== '' ? med_rep_phone : null,
        request_type, formulary_request_type, category,
        sourceType,
        brand_name, generic_name, dose_strength, dosage_form,
        manufacturer, marketer,
        existing_brands || null,
        clinical_justification, expected_patients_pm,
        !!cost_reduction_benefit,
        // Real bug found via E2E testing, fixed here: these two were
        // swapped relative to the column list above (medicine_quantity,
        // ai_content) -- the medicine_quantity value was silently landing
        // in the ai_content column instead, confirmed by fetching a real
        // submitted row back out of the database, not just re-reading the
        // code. Oracle's named binds could never have had this class of
        // bug; it's specific to manually ordering positional parameters.
        medicine_quantity ? Number(medicine_quantity) : null,
        formatai || null,
        initialStatus,
        initialStage,
        isHOD,
        isHOD ? new Date() : null,
      ]
    );
    const requestId = Number(insertResult.rows[0].request_id);

    const sourceLabel = isPromotional ? 'Promotional (Industry-Sponsored)' : 'Non-Promotional (Clinician-Initiated)';
    const classLabel = formulary_request_type === 'FORMULARY' ? '[Formulary Request]' : '[Non-Formulary Request]';

    await writeAudit(pool, requestId, 'SUBMITTED', doctor_id, null, initialStage,
      `Source: ${sourceLabel} | Class: ${formulary_request_type}`);

    if (creatorRole && creatorRole.toLowerCase() === ROLES.DOCTOR && hodId) {
      await createNotification(pool, hodId, requestId,
        `${classLabel} New ${sourceLabel} drug request #${requestId} submitted by Dr. ${creatorName || 'Unknown'}. Awaiting HOD approval.`
      );
    } else if (creatorRole && creatorRole.toLowerCase() === ROLES.HOD) {
      const pharmUsers = await pool.query(`SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACIST' AND is_active = true`);
      await createNotificationsBulk(pool, pharmUsers.rows.map(r => Number(r.user_id)), requestId,
        `${classLabel} New ${sourceLabel} drug request #${requestId} submitted by HOD. Drug: ${brand_name}. Awaiting initial review.`
      );
    } else {
      const phUsers = await pool.query(`SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACYHEAD' AND is_active = true`);
      // Not necessarily a doctor here (falls through when creator is
      // neither 'doctor' nor 'hod'), so no "Dr." prefix — just their name.
      const submitterText = creatorName || 'a colleague';
      await createNotificationsBulk(pool, phUsers.rows.map(r => Number(r.user_id)), requestId,
        `${classLabel} New ${sourceLabel} drug request #${requestId} submitted by ${submitterText}. Drug: ${brand_name}. Awaiting your review.`
      );
    }

    res.status(201).json({ message: 'Drug request submitted successfully.', request_id: requestId });
  } catch (err) {
    console.error('POST /api/requests error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.get('/:requestId/existing-generic-data', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const rid = parseInt(req.params.requestId);
    const result = await pool.query(
      `SELECT existing_generic_data FROM drug_requests WHERE request_id = $1`,
      [rid]
    );
    if (!result.rows.length) return res.json({ existing_generic_data: null });
    const row = result.rows[0];
    let parsed = null;
    try { parsed = row.existing_generic_data ? JSON.parse(row.existing_generic_data) : null; } catch { parsed = null; }
    res.json({ existing_generic_data: parsed });
  } catch (err) {
    console.error('GET existing-generic-data error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.get('/:role/:userId', requireAuth, async (req, res) => {
  const { role, userId } = req.params;
  const normalizedRole = role?.toLowerCase();

  // A token can only be used to view that same person's own requests —
  // without this, any logged-in user's valid token could read anyone
  // else's requests just by changing the URL's role/userId. Uses
  // rolesMatch() rather than strict equality because of the 'dtc'/
  // 'dtccommittee' alias — see utils/workflow.js.
  if (!rolesMatch(req.user.role, normalizedRole) || req.user.id !== Number(userId)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to view these requests.' });
  }

  const pool = getPgPool();

  try {

    const {
      status,
      category,
      from_date,
      to_date,
      source_type,
      formulary_type
    } = req.query;

    let query = '';
    const values = [];
    function addParam(val) {
      values.push(val);
      return `$${values.length}`;
    }

    if (normalizedRole === ROLES.DOCTOR) {

      const p = addParam(userId);
      query = `
        SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept, u_dtc.name AS dtc_reviewer_name
        FROM drug_requests dr
        JOIN users u ON u.user_id = dr.doctor_id
        LEFT JOIN users u_dtc ON u_dtc.user_id = dr.dtc_reviewed_by
        WHERE dr.doctor_id = ${p}
      `;

    } else if (normalizedRole === ROLES.HOD) {

      const p = addParam(userId);
      query = `
        SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept, u_dtc.name AS dtc_reviewer_name
        FROM drug_requests dr
        JOIN users u ON u.user_id = dr.doctor_id
        LEFT JOIN users u_dtc ON u_dtc.user_id = dr.dtc_reviewed_by
        WHERE (dr.hod_id = ${p}
          AND dr.current_stage = 'HOD'
          AND dr.status = 'PENDING_HOD')
          OR (dr.created_by_user_id = ${p})
      `;

    } else if (normalizedRole === ROLES.PHARMACY_HEAD) {

      query = `
        SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept, u_dtc.name AS dtc_reviewer_name
        FROM drug_requests dr
        JOIN users u ON u.user_id = dr.doctor_id
        LEFT JOIN users u_dtc ON u_dtc.user_id = dr.dtc_reviewed_by
        WHERE (
          dr.current_stage IN ('PharmacyHead','PharmacyHeadReview2')
          AND dr.status IN ('Pending', 'HOD_APPROVED', 'REVERTED_BY_DTC')
        )
        OR dr.is_emergency = true
      `;

    } else if (normalizedRole === ROLES.PHARMACIST) {

      const p = addParam(userId);
      query = `
        SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept, u_dtc.name AS dtc_reviewer_name
        FROM drug_requests dr
        JOIN users u ON u.user_id = dr.doctor_id
        LEFT JOIN users u_dtc ON u_dtc.user_id = dr.dtc_reviewed_by
        WHERE (
          dr.current_stage = 'PharmacistInitialReview'
          AND dr.status = 'HOD_APPROVED'
        )
        OR (
          dr.current_stage = 'Pharmacist'
          AND dr.status = 'Pending'
        )
        OR (
          dr.current_stage = 'PharmacistCorrection'
          AND dr.status = 'REVERTED_FOR_CORRECTION'
        )
        OR dr.is_emergency = true
        OR dr.status IN ('APPROVED_PENDING_ORDER', 'ORDER_PLACED', 'INVENTORY_RECEIVED')
        OR dr.created_by_user_id = ${p}
      `;

    } else if (normalizedRole === ROLES.DTC_COMMITTEE) {

      query = `
        SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept, u_dtc.name AS dtc_reviewer_name
        FROM drug_requests dr
        JOIN users u ON u.user_id = dr.doctor_id
        LEFT JOIN users u_dtc ON u_dtc.user_id = dr.dtc_reviewed_by
        WHERE (
          dr.current_stage IN ('DTCCommittee','DTCFinal')
          AND dr.status IN ('Pending', 'PHARMACY_HEAD_REJECTED_PENDING_DTC', 'PHARMACIST_REJECTED_PENDING_DTC')
        )
        OR (
          dr.current_stage = 'EmergencyDTC'
          AND dr.status = 'EMERGENCY_PENDING_DTC'
        )
      `;

    } else if (normalizedRole === ROLES.CEO) {

      query = `
        SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept, u_dtc.name AS dtc_reviewer_name
        FROM drug_requests dr
        JOIN users u ON u.user_id = dr.doctor_id
        LEFT JOIN users u_dtc ON u_dtc.user_id = dr.dtc_reviewed_by
        WHERE dr.current_stage = 'CEO'
        AND dr.status = 'Pending'
      `;

    } else {

      console.log("INVALID ROLE:", role);

      return res.status(400).json({
        error: 'Invalid role.'
      });
    }

    let whereClause = '';

    if (status) {
      whereClause += ` AND dr.status = ${addParam(status)}`;
    }

    if (category) {
      whereClause += ` AND LOWER(dr.category) LIKE LOWER(${addParam(`%${category}%`)})`;
    }

    if (from_date) {
      whereClause += ` AND dr.created_at >= TO_TIMESTAMP(${addParam(from_date)}, 'YYYY-MM-DD')`;
    }

    if (to_date) {
      whereClause += ` AND dr.created_at < TO_TIMESTAMP(${addParam(to_date)}, 'YYYY-MM-DD') + INTERVAL '1 day'`;
    }

    if (source_type) {
      whereClause += ` AND dr.request_source_type = ${addParam(source_type)}`;
    }

    if (formulary_type) {
      whereClause += ` AND dr.formulary_request_type = ${addParam(formulary_type)}`;
    }

    const finalQuery = `
      SELECT * FROM (${query}) dr
      WHERE 1=1 ${whereClause}
      ORDER BY dr.created_at DESC
    `;

    const result = await pool.query(finalQuery, values);
    const rows = result.rows.map(upperKeys);

    for (const r of rows) {
      r.DTC_REVIEWED_BY_NAME = r.DTC_REVIEWED_BY_NAME || r.DTC_REVIEWER_NAME || '';
    }

    if (rows.length > 0) {
      const requestIds = rows.map(r => Number(r.REQUEST_ID));

      const entriesResult = await pool.query(
        `SELECT * FROM drug_effective_entries WHERE request_id = ANY($1::bigint[]) ORDER BY entry_id ASC`,
        [requestIds]
      );

      const entriesMap = {};
      entriesResult.rows.forEach(entry => {
        const rid = Number(entry.request_id);
        if (!entriesMap[rid]) {
          entriesMap[rid] = [];
        }
        entriesMap[rid].push(formatEffectiveEntryRow(entry));
      });

      rows.forEach(r => {
        r.effective_drug_entries = entriesMap[Number(r.REQUEST_ID)] || [];
      });
    }

    res.json(rows);

  } catch (err) {

    console.error('GET /api/requests error:', err);

    res.status(500).json({
      error: 'Internal server error.',
      detail: err.message
    });

  }
});

router.put('/:id/approve', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const { remarks } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    const reqResult = await pool.query(
      `SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept
       FROM drug_requests dr
       JOIN users u ON u.user_id = dr.doctor_id
       WHERE dr.request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    const dr = reqResult.rows[0];
    if (dr.status !== 'Pending' && dr.status !== 'EMERGENCY_PENDING_DTC' && dr.status !== 'PENDING_HOD' && dr.status !== 'HOD_APPROVED' && dr.status !== 'PHARMACY_HEAD_REJECTED_PENDING_DTC' && dr.status !== 'PHARMACIST_REJECTED_PENDING_DTC' && dr.status !== 'REVERTED_BY_DTC') return res.status(400).json({ error: 'Request is no longer pending.' });

    const fromStage = dr.current_stage;

    // The core Bucket B rule: only the role responsible for the request's
    // CURRENT stage may approve it — e.g. only 'hod' can approve while it
    // sits at the HOD stage, only 'ceo' once it reaches CEO, etc.
    const approverRole = getApproverRoleForStage(fromStage);
    if (!approverRole || !rolesMatch(req.user.role, approverRole)) {
      return res.status(403).json({ error: 'You are not authorized to approve this request at its current stage.' });
    }

    let toStage = NEXT_STAGE[fromStage];

    // PHARMACIST Direct Flow overrides
    if (dr.request_source_type === 'PHARMACIST') {
      if (fromStage === 'DTCCommittee') {
        toStage = 'CEO'; // Skip alternatives
      } else if (fromStage === 'CEO') {
        toStage = 'PharmacistOrder'; // Go straight to order placed
      }
    }

    // ── Block DTCFinal from using /approve — must use /dtc/final-select instead
    if (fromStage === 'DTCFinal') {
      return res.status(400).json({
        error: 'DTCFinal stage requires drug selection. Use POST /api/dtc/final-select/:id instead of /approve.'
      });
    }


    const isFinal = (toStage === 'Final');
    const remarksCol = fromStage === 'HOD' ? 'hod_remarks'
      : fromStage === 'PharmacistInitialReview' ? 'pharmacist_remarks'
        : fromStage === 'PharmacyHead' ? 'ph_remarks'
          : fromStage === 'DTCCommittee' ? 'dtc_remarks'
            : fromStage === 'Pharmacist' ? 'pharmacist_remarks'
              : fromStage === 'PharmacyHeadReview2' ? 'ph_remarks2'
                : fromStage === 'DTCFinal' ? 'dtc_final_remarks'
                  : fromStage === 'EmergencyDTC' ? 'dtc_remarks'
                    : 'ceo_remarks';

    const isEmergency = dr.is_emergency === true;
    let newStatus = isEmergency ? 'EMERGENCY_APPROVED' : (isFinal ? 'Approved' : 'Pending');
    if (fromStage === 'HOD') newStatus = 'HOD_APPROVED';
    if (toStage === 'PharmacistOrder') newStatus = 'APPROVED_PENDING_ORDER';

    let updateQuery = `UPDATE drug_requests
          SET current_stage = $1,
              status        = $2,
              ${remarksCol} = $3,
              updated_at    = CURRENT_TIMESTAMP`;
    if (fromStage === 'HOD') {
      updateQuery += `, approved_by_hod = true, hod_action_timestamp = CURRENT_TIMESTAMP`;
    }
    updateQuery += ` WHERE request_id = $4`;

    await pool.query(
      updateQuery,
      [toStage, newStatus, remarks || null, requestId]
    );

    await writeAudit(pool, requestId, 'APPROVED', performed_by, fromStage, toStage, remarks);

    // Save approval remarks to history
    let remarkRole = null;
    if (fromStage === 'HOD') remarkRole = 'HOD';
    else if (fromStage === 'PharmacyHead' || fromStage === 'PharmacyHeadReview2') remarkRole = 'PharmacyHead';
    else if (fromStage === 'DTCCommittee' || fromStage === 'EmergencyDTC') remarkRole = 'DTC';
    else if (fromStage === 'CEO') remarkRole = 'CEO';

    if (remarkRole && remarks) {
      const customRemarksVal = req.body.customRemarks || remarks;
      await saveApprovalRemarks(pool, customRemarksVal, remarkRole, performed_by);
    }

    if (isFinal) {
      // Notify doctor
      await createNotification(pool, Number(dr.doctor_id), requestId,
        `🎉 Your drug request #${requestId} (${dr.brand_name}) has received FINAL APPROVAL!`
      );
      // Notify Pharmacist to initiate drug order
      const pharmUsers = await pool.query(
        `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACIST' AND is_active = true`
      );
      await createNotificationsBulk(pool, pharmUsers.rows.map(r => Number(r.user_id)), requestId,
        `✅ Drug request #${requestId} (${dr.brand_name}) is FINALLY APPROVED. Please initiate the drug order process.`
      );
    } else {
      if (toStage === 'PharmacistOrder') {
        const orderUsers = await pool.query(
          `SELECT user_id FROM users WHERE UPPER(role) IN ('PHARMACIST', 'PHARMACYHEAD') AND is_active = true`
        );
        await createNotificationsBulk(pool, orderUsers.rows.map(r => Number(r.user_id)), requestId,
          `🚨 Emergency request #${requestId} (${dr.brand_name}) has been APPROVED. Please place the order immediately.`
        );
      } else {
        // Determine which role(s) to notify based on toStage
        const stageRoleMap = {
          PharmacistInitialReview: 'Pharmacist',
          PharmacyHead: 'PharmacyHead',
          DTCCommittee: 'DTCCommittee',
          Pharmacist: 'Pharmacist',
          PharmacyHeadReview2: 'PharmacyHead',
          DTCFinal: 'DTCCommittee',
          CEO: 'CEO',
        };
        const nextRole = stageRoleMap[toStage];
        if (nextRole) {
          let roleQuery = `SELECT user_id FROM users WHERE UPPER(role) = $1 AND is_active = true`;
          let roleValues = [nextRole.toUpperCase()];
          if (nextRole.toUpperCase() === 'DTCCOMMITTEE') {
            roleQuery = `SELECT user_id FROM users WHERE UPPER(role) IN ('DTC', 'DTCCOMMITTEE') AND is_active = true`;
            roleValues = [];
          }
          const nextUsers = await pool.query(roleQuery, roleValues);
          await createNotificationsBulk(pool, nextUsers.rows.map(r => Number(r.user_id)), requestId,
            `Drug request #${requestId} (${dr.brand_name}) approved by ${STAGE_LABELS[fromStage]}. Awaiting your review.`
          );
        }
      }
      let doctorMsg = `Your drug request #${requestId} (${dr.brand_name}) has been approved by ${STAGE_LABELS[fromStage]} and forwarded to ${STAGE_LABELS[toStage]}.`;
      const internalStages = ['PharmacistInitialReview', 'PharmacyHead', 'Pharmacist', 'PharmacyHeadReview2', 'DTCCommittee', 'DTCFinal'];
      if (fromStage === 'HOD' || internalStages.includes(toStage)) {
        doctorMsg = `Your drug request #${requestId} (${dr.brand_name}) has been forwarded to DTC Committee for further review.`;
      }
      await createNotification(pool, Number(dr.doctor_id), requestId, doctorMsg);
    }

    res.json({
      message: isFinal ? 'Request finally approved.' : `Request approved and forwarded to ${STAGE_LABELS[toStage]}.`,
      new_stage: toStage,
      new_status: newStatus
    });
  } catch (err) {
    console.error('PUT approve error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.put('/:id/reject', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const { remarks, customRemarks } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    if (!remarks || remarks.trim() === '') {
      return res.status(400).json({ error: 'Remarks are mandatory when rejecting a request.' });
    }

    const reqResult = await pool.query(
      `SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept
       FROM drug_requests dr
       JOIN users u ON u.user_id = dr.doctor_id
       WHERE dr.request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    const dr = reqResult.rows[0];
    if (dr.status !== 'Pending' && dr.status !== 'EMERGENCY_PENDING_DTC' && dr.status !== 'PENDING_HOD' && dr.status !== 'HOD_APPROVED' && dr.status !== 'PHARMACY_HEAD_REJECTED_PENDING_DTC' && dr.status !== 'PHARMACIST_REJECTED_PENDING_DTC' && dr.status !== 'REVERTED_BY_DTC') return res.status(400).json({ error: 'Request is no longer pending.' });

    const fromStage = dr.current_stage;

    const approverRole = getApproverRoleForStage(fromStage);
    if (!approverRole || !rolesMatch(req.user.role, approverRole)) {
      return res.status(403).json({ error: 'You are not authorized to reject this request at its current stage.' });
    }

    const remarksCol = fromStage === 'HOD' ? 'hod_remarks'
      : fromStage === 'PharmacistInitialReview' ? 'pharmacist_remarks'
        : fromStage === 'PharmacyHead' ? 'ph_remarks'
          : fromStage === 'DTCCommittee' ? 'dtc_remarks'
            : fromStage === 'Pharmacist' ? 'pharmacist_remarks'
              : fromStage === 'PharmacyHeadReview2' ? 'ph_remarks2'
                : fromStage === 'DTCFinal' ? 'dtc_final_remarks'
                  : fromStage === 'EmergencyDTC' ? 'dtc_remarks'
                    : 'ceo_remarks';

    const isEmergency = dr.is_emergency === true;
    let rejectStatus = isEmergency ? 'EMERGENCY_REJECTED' : 'Rejected';
    let toStage = 'Rejected';

    if (fromStage === 'HOD') rejectStatus = 'HOD_REJECTED';
    // Pharmacist and Pharmacy Head don't have real reject authority during
    // this first pass -- only DTC's decision is final here (HOD is the only
    // stage where a reject truly ends the request). A "reject" at either of
    // these stages instead forwards to DTC for the actual decision, exactly
    // like Pharmacy Head's case just below.
    else if (fromStage === 'PharmacistInitialReview') {
      rejectStatus = 'PHARMACIST_REJECTED_PENDING_DTC';
      toStage = 'DTCCommittee';
    } else if (fromStage === 'PharmacyHead') {
      rejectStatus = 'PHARMACY_HEAD_REJECTED_PENDING_DTC';
      toStage = 'DTCCommittee';
    }

    let updateQuery = `UPDATE drug_requests
          SET current_stage = $1,
              status        = $2,
              ${remarksCol} = $3,
              updated_at    = CURRENT_TIMESTAMP`;
    if (fromStage === 'HOD') {
      updateQuery += `, hod_action_timestamp = CURRENT_TIMESTAMP`;
    }
    updateQuery += ` WHERE request_id = $4`;

    await pool.query(
      updateQuery,
      [toStage, rejectStatus, remarks, requestId]
    );

    await writeAudit(pool, requestId, 'REJECTED', performed_by, fromStage, toStage, remarks);

    if (fromStage === 'PharmacyHead' || fromStage === 'PharmacistInitialReview') {
      const rejectedByLabel = fromStage === 'PharmacyHead' ? 'Pharmacy Head' : 'Pharmacist';
      const dtcUsers = await pool.query(`SELECT user_id FROM users WHERE UPPER(role) IN ('DTC', 'DTCCOMMITTEE') AND is_active = true`);
      await createNotificationsBulk(pool, dtcUsers.rows.map(r => Number(r.user_id)), requestId,
        `Drug request #${requestId} (${dr.brand_name}) was rejected by ${rejectedByLabel} and forwarded for your final review. Reason: ${remarks}`
      );
      // Notify Doctor & HOD neutrally -- this isn't actually a final
      // rejection, so don't tell them it was "rejected".
      await createNotification(pool, Number(dr.doctor_id), requestId,
        `Your drug request #${requestId} (${dr.brand_name}) has been forwarded to DTC Committee for further review.`
      );
      if (dr.hod_id) {
        await createNotification(pool, Number(dr.hod_id), requestId,
          `Drug request #${requestId} (${dr.brand_name}) has been forwarded to DTC Committee for further review.`
        );
      }
    } else {
      // For all other stages (HOD, DTC, CEO) — a reject here is genuinely
      // final, so notify the Doctor it was actually rejected.
      await createNotification(pool, Number(dr.doctor_id), requestId,
        `Your drug request #${requestId} (${dr.brand_name}) has been rejected by ${STAGE_LABELS[fromStage] || fromStage}. Reason: ${remarks}`
      );
    }

    if (fromStage === 'DTCCommittee' || fromStage === 'CEO') {
      const phUsers = await pool.query(
        `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACYHEAD' AND is_active = true`
      );
      await createNotificationsBulk(pool, phUsers.rows.map(r => Number(r.user_id)), requestId,
        `Drug request #${requestId} (${dr.brand_name}) was rejected by DTC Committee. Reason: ${remarks}`
      );
    }
    if (fromStage === 'CEO') {
      const dtcUsers = await pool.query(
        `SELECT user_id FROM users WHERE UPPER(role) IN ('DTC', 'DTCCOMMITTEE') AND is_active = true`
      );
      await createNotificationsBulk(pool, dtcUsers.rows.map(r => Number(r.user_id)), requestId,
        `Drug request #${requestId} (${dr.brand_name}) was rejected by DTC Committee. Reason: ${remarks}`
      );
    }

    // Safe save of manually entered custom remarks to history
    if (customRemarks && Array.isArray(customRemarks)) {
      try {
        for (const remark of customRemarks) {
          const trimmedRemark = remark.trim();
          if (trimmedRemark === '') continue;

          // Check if same remark already exists (case-insensitive + trimmed)
          const remarkCheck = await pool.query(
            `SELECT history_id, usage_count FROM rejection_remark_history
             WHERE LOWER(TRIM(remark_text)) = LOWER(TRIM($1))`,
            [trimmedRemark]
          );

          if (remarkCheck.rows.length > 0) {
            const historyId = remarkCheck.rows[0].history_id;
            await pool.query(
              `UPDATE rejection_remark_history
               SET usage_count = usage_count + 1,
                   last_used_at = CURRENT_TIMESTAMP
               WHERE history_id = $1`,
              [historyId]
            );
          } else {
            await pool.query(
              `INSERT INTO rejection_remark_history (remark_text, created_by, usage_count, last_used_at, is_active)
               VALUES ($1, $2, 1, CURRENT_TIMESTAMP, true)`,
              [trimmedRemark, performed_by || null]
            );
          }
        }
      } catch (historyErr) {
        console.error('Failed to save rejection remark history:', historyErr);
      }
    }

    res.json({ message: 'Request rejected successfully.' });
  } catch (err) {
    console.error('PUT reject error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.put('/:id/initial-review-approve', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const { effective_created_at, remarks, effective_drug_entries } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    const reqResult = await pool.query(
      `SELECT dr.*, u.name AS doctor_name, u.department AS doctor_dept
       FROM drug_requests dr
       JOIN users u ON u.user_id = dr.doctor_id
       WHERE dr.request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    const dr = reqResult.rows[0];
    if (dr.current_stage !== 'PharmacistInitialReview') {
      return res.status(400).json({ error: 'Request is not in PharmacistInitialReview stage.' });
    }

    const approverRole = getApproverRoleForStage(dr.current_stage);
    if (!approverRole || !rolesMatch(req.user.role, approverRole)) {
      return res.status(403).json({ error: 'You are not authorized to review this request.' });
    }
    if (dr.status !== 'HOD_APPROVED' && dr.status !== 'Pending') {
      return res.status(400).json({ error: 'Request is not awaiting pharmacist initial review.' });
    }

    // Parse the effective_created_at value
    let effTs = null;
    if (effective_created_at && effective_created_at.trim() !== '') {
      effTs = new Date(effective_created_at);
      if (isNaN(effTs.getTime())) {
        return res.status(400).json({ error: 'Invalid effective_created_at datetime value.' });
      }
    }

    // Validate and prepare effective drug entries datetimes if any
    const entriesToSave = [];
    if (Array.isArray(effective_drug_entries)) {
      for (const entry of effective_drug_entries) {
        let entryEffTs = null;
        if (entry.effective_created_at && typeof entry.effective_created_at === 'string' && entry.effective_created_at.trim() !== '') {
          entryEffTs = new Date(entry.effective_created_at);
          if (isNaN(entryEffTs.getTime())) {
            return res.status(400).json({ error: `Invalid datetime value for drug: ${entry.drug_name}` });
          }
        }
        // Save the full entry structure inside the remarks JSON
        const remarksJson = JSON.stringify(entry);
        entriesToSave.push({
          drug_name: entry.drug_name || '',
          effective_created_at: entryEffTs,
          remarksJson: remarksJson
        });
      }
    }

    const toStage = 'PharmacyHead';
    const newStatus = 'Pending';

    // Build update — set effective_created_at only if provided, else default to created_at
    if (effTs) {
      await pool.query(
        `UPDATE drug_requests
           SET current_stage          = $1,
               status                 = $2,
               pharmacist_remarks     = $3,
               effective_created_at   = $4,
               updated_at             = CURRENT_TIMESTAMP
         WHERE request_id = $5`,
        [toStage, newStatus, remarks || null, effTs, requestId]
      );
    } else {
      await pool.query(
        `UPDATE drug_requests
           SET current_stage          = $1,
               status                 = $2,
               pharmacist_remarks     = $3,
               effective_created_at   = created_at,
               updated_at             = CURRENT_TIMESTAMP
         WHERE request_id = $4`,
        [toStage, newStatus, remarks || null, requestId]
      );
    }

    // Save drug effective entries
    await pool.query(
      `DELETE FROM drug_effective_entries WHERE request_id = $1`,
      [requestId]
    );

    // Was one INSERT per entry (N round trips) -- no row depends on
    // another's generated ID, so this batches into a single multi-row
    // INSERT (one round trip).
    if (entriesToSave.length > 0) {
      const values = [];
      const tuples = entriesToSave.map((entry, i) => {
        const base = i * 5;
        values.push(requestId, entry.drug_name || null, entry.effective_created_at, entry.remarksJson || null, performed_by);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });
      await pool.query(
        `INSERT INTO drug_effective_entries (
          request_id, drug_name, effective_created_at, remarks, created_by
        ) VALUES ${tuples.join(', ')}`,
        values
      );
    }

    await writeAudit(pool, requestId, 'INITIAL_REVIEW_APPROVED', performed_by, 'PharmacistInitialReview', toStage, remarks);

    // Notify PharmacyHead users
    const phUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACYHEAD' AND is_active = true`
    );
    await createNotificationsBulk(pool, phUsers.rows.map(r => Number(r.user_id)), requestId,
      `Drug request #${requestId} (${dr.brand_name}) has passed Pharmacist Initial Review and is awaiting your approval.`
    );

    // Notify Doctor that request has moved forward (neutral DTC-review message)
    await createNotification(pool, Number(dr.doctor_id), requestId,
      `Your drug request #${requestId} (${dr.brand_name}) is currently under DTC review.`
    );

    res.json({
      message: `Request #${requestId} approved by Pharmacist Initial Review and forwarded to Pharmacy Head.`,
      new_stage: toStage,
      new_status: newStatus
    });
  } catch (err) {
    console.error('PUT /initial-review-approve error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// Lets Pharmacist/Pharmacy Head correct the generic name, dose/strength,
// and dosage form directly from the Comparison Sheet header. Every later
// stage (DTC, CEO, etc.) reads this same drug_requests row (SELECT dr.*),
// so a correction made here is automatically visible everywhere
// downstream -- no separate propagation needed, one source of truth.
router.put('/:id/drug-info', requireRole(ROLES.PHARMACIST, ROLES.PHARMACY_HEAD), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const { generic_name, dose_strength, dosage_form } = req.body;

    const genericName = typeof generic_name === 'string' && generic_name.trim() !== '' ? generic_name.trim() : null;
    const doseStrength = typeof dose_strength === 'string' && dose_strength.trim() !== '' ? dose_strength.trim() : null;
    const dosageForm = typeof dosage_form === 'string' && dosage_form.trim() !== '' ? dosage_form.trim() : null;

    if (!genericName && !doseStrength && !dosageForm) {
      return res.status(400).json({ error: 'At least one of generic_name, dose_strength, dosage_form is required.' });
    }

    const reqResult = await pool.query(
      `SELECT request_id FROM drug_requests WHERE request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    await pool.query(
      `UPDATE drug_requests
         SET generic_name  = COALESCE($1, generic_name),
             dose_strength = COALESCE($2, dose_strength),
             dosage_form   = COALESCE($3, dosage_form),
             updated_at    = CURRENT_TIMESTAMP
       WHERE request_id = $4`,
      [genericName, doseStrength, dosageForm, requestId]
    );

    res.json({ message: 'Drug info updated.', generic_name: genericName, dose_strength: doseStrength, dosage_form: dosageForm });
  } catch (err) {
    console.error('PUT /:id/drug-info error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.post('/pharmacist', requireRole(ROLES.PHARMACIST), async (req, res) => {
  const pool = getPgPool();
  try {
    const {
      doctor_id, request_type, category,
      brand_name, generic_name, dose_strength, dosage_form,
      manufacturer, marketer, existing_brands,
      clinical_justification, medicine_quantity, ai_content
    } = req.body;

    let formatai = ai_content ? ai_content.replace(/\n/g, '<br>') : '';

    const baseRequired = {
      doctor_id, category, brand_name, generic_name,
      dose_strength, dosage_form, manufacturer, marketer,
      clinical_justification
    };
    for (const [key, val] of Object.entries(baseRequired)) {
      if (val === undefined || val === null || String(val).trim() === '') {
        return res.status(400).json({ error: `Field '${key}' is required.` });
      }
    }

    // -- Blacklist validation --
    const blHit = await checkBlacklist(pool, manufacturer, marketer);
    if (blHit) {
      return res.status(400).json({
        success: false,
        error: `Request denied. ${blHit.type} is blacklisted by DTC.`,
        remarks: blHit.remarks
      });
    }

    const result = await pool.query(
      `INSERT INTO drug_requests (
        doctor_id, request_source_type, request_type, category,
        brand_name, generic_name, dose_strength, dosage_form,
        manufacturer, marketer, existing_brands,
        clinical_justification, ai_content, expected_patients_pm, cost_reduction_benefit,
        medicine_quantity,
        current_stage, status, created_by_role, created_by_user_id
      ) VALUES (
        $1, 'PHARMACIST', 'New Molecule', $2,
        $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, 0, false,
        $12,
        'PharmacyHead', 'Pending', 'Pharmacist', $1
      ) RETURNING request_id`,
      [
        doctor_id,
        category,
        brand_name,
        generic_name,
        dose_strength,
        dosage_form,
        manufacturer,
        marketer,
        existing_brands || null,
        clinical_justification,
        formatai,
        medicine_quantity ? Number(medicine_quantity) : null,
      ]
    );
    const reqId = Number(result.rows[0].request_id);

    await writeAudit(pool, reqId, 'SUBMITTED', req.user.id, null, 'PharmacyHead', 'Pharmacist direct request submitted.');

    // Notify PharmacyHead
    const phUsers = await pool.query(`SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACYHEAD' AND is_active = true`);
    await createNotificationsBulk(pool, phUsers.rows.map(r => Number(r.user_id)), reqId, `💊 New Pharmacist Direct drug request #${reqId} (${brand_name}) requires your review.`);

    res.status(201).json({ message: 'Request submitted successfully.', request_id: reqId });
  } catch (err) {
    console.error('POST pharmacist request error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.post('/emergency', requireAuth, async (req, res) => {
  const {
    doctor_id, request_type, category, brand_name, generic_name,
    dose_strength, dosage_form, manufacturer, marketer,
    existing_brands, clinical_justification, ai_content,
    request_source_type, med_rep_name, med_rep_email, med_rep_phone
  } = req.body;

  if (![ROLES.DOCTOR, ROLES.HOD].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only doctors and HODs can submit emergency requests.' });
  }
  if (req.user.id !== Number(doctor_id)) {
    return res.status(403).json({ error: 'You can only submit requests as yourself.' });
  }

  const pool = getPgPool();
  try {
    const required = {
      doctor_id, request_type, category, brand_name, generic_name, dose_strength,
      dosage_form, manufacturer, marketer, clinical_justification
    };
    for (const [k, v] of Object.entries(required)) {
      if (v === undefined || v === null || v === '') {
        return res.status(400).json({ error: `Field '${k}' is required.` });
      }
    }

    // -- Blacklist validation --
    const blHit = await checkBlacklist(pool, manufacturer, marketer);
    if (blHit) {
      return res.status(400).json({
        success: false,
        error: `Request denied. ${blHit.type} is blacklisted by DTC.`,
        remarks: blHit.remarks
      });
    }

    const sourceType = (request_source_type || 'NON_PROMOTIONAL').toUpperCase();
    if (!['PROMOTIONAL', 'NON_PROMOTIONAL'].includes(sourceType)) {
      return res.status(400).json({ error: 'request_source_type must be PROMOTIONAL or NON_PROMOTIONAL.' });
    }
    const isPromotional = sourceType === 'PROMOTIONAL';

    // Same accountability rule as the main POST /api/requests endpoint --
    // "emergency" only shortens the approval pipeline (skips straight to
    // EmergencyDTC), it does not exempt a promotional-sourced request from
    // disclosing who's promoting the drug. This endpoint used to skip this
    // check entirely and hardcode med_rep_* to NULL regardless of source
    // type -- confirmed live against the real database that a request
    // could reach EmergencyDTC tagged PROMOTIONAL with zero med-rep
    // disclosure before this fix.
    if (isPromotional) {
      const repRequired = { med_rep_name, med_rep_email, med_rep_phone };
      for (const [key, val] of Object.entries(repRequired)) {
        if (!val || String(val).trim() === '') {
          return res.status(400).json({ error: `Field '${key}' is required for Promotional requests.` });
        }
      }
    }

    // Fetch creator role & department
    const creatorRes = await pool.query(`SELECT role, department FROM users WHERE user_id = $1`, [doctor_id]);
    if (creatorRes.rows.length === 0) return res.status(400).json({ error: 'User not found.' });
    const creatorRole = creatorRes.rows[0].role;
    const creatorDept = creatorRes.rows[0].department;

    let hodId = null;
    if (creatorRole && creatorRole.toLowerCase() === ROLES.DOCTOR) {
      if (creatorDept && creatorDept.trim() !== '') {
        const hodRes = await pool.query(
          `SELECT user_id FROM users WHERE UPPER(role) = 'HOD' AND UPPER(TRIM(department)) = UPPER(TRIM($1)) AND is_active = true`,
          [creatorDept.trim()]
        );
        if (hodRes.rows.length > 0) hodId = Number(hodRes.rows[0].user_id);
      }
    }

    const insertResult = await pool.query(
      `INSERT INTO drug_requests (
         doctor_id, created_by_user_id, created_by_role, hod_id,
         med_rep_name, med_rep_email, med_rep_phone,
         request_type, category, request_source_type,
         brand_name, generic_name, dose_strength, dosage_form,
         manufacturer, marketer, existing_brands, clinical_justification,
         expected_patients_pm, cost_reduction_benefit, medicine_quantity, ai_content,
         status, current_stage, is_emergency
       ) VALUES (
         $1, $1, $2, $3,
         $4, $5, $6,
         $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15, $16, $17,
         NULL, false, NULL, $18,
         'EMERGENCY_PENDING_DTC', 'EmergencyDTC', true
       ) RETURNING request_id`,
      [
        doctor_id,
        creatorRole,
        hodId,
        isPromotional ? med_rep_name : null,
        isPromotional ? med_rep_email : null,
        isPromotional ? med_rep_phone : null,
        request_type, category,
        sourceType,
        brand_name, generic_name, dose_strength, dosage_form,
        manufacturer, marketer, existing_brands || null,
        clinical_justification,
        ai_content || null,
      ]
    );
    const requestId = Number(insertResult.rows[0].request_id);
    await writeAudit(pool, requestId, 'EMERGENCY_SUBMITTED', req.user.id, null, 'EmergencyDTC', `Source: ${sourceType}`);

    // Notify DTC (decision makers), PH + Pharmacist (view-only awareness)
    const notifyUsers = await pool.query(
      `SELECT user_id, role FROM users WHERE UPPER(role) IN ('DTC','DTCCOMMITTEE','PHARMACYHEAD','PHARMACIST') AND is_active = true`
    );
    // Message varies by role (DTC gets an action prompt, others get
    // view-only notice), so this is two bulk groups rather than one --
    // still a fixed, small number of round trips regardless of how many
    // recipients each group has.
    const isDtcRole = (row) => ['DTC', 'DTCCOMMITTEE'].includes((row.role || '').toUpperCase());
    const dtcDecisionMakers = notifyUsers.rows.filter(isDtcRole).map(r => Number(r.user_id));
    const viewOnlyRecipients = notifyUsers.rows.filter(r => !isDtcRole(r)).map(r => Number(r.user_id));
    await createNotificationsBulk(pool, dtcDecisionMakers, requestId,
      `🚨 EMERGENCY request #${requestId} (${brand_name}) submitted. Requires your IMMEDIATE decision.`
    );
    await createNotificationsBulk(pool, viewOnlyRecipients, requestId,
      `🚨 EMERGENCY request #${requestId} (${brand_name}) submitted. You have view-only access.`
    );
    res.status(201).json({ message: 'Emergency drug request submitted.', request_id: requestId });
  } catch (err) {
    console.error('POST /api/requests/emergency error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.post('/:id/place_order', requireRole(ROLES.PHARMACIST), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const performed_by = req.user.id; // never trust a client-supplied performer id

    const reqResult = await pool.query(
      `SELECT status FROM drug_requests WHERE request_id = $1`, [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });
    const currentStatus = reqResult.rows[0].status;
    if (currentStatus !== 'EMERGENCY_APPROVED' && currentStatus !== 'APPROVED_PENDING_ORDER') {
      return res.status(400).json({ error: 'Only approved requests can be ordered.' });
    }

    await pool.query(
      `UPDATE drug_requests SET status = 'ORDER_PLACED', current_stage = 'OrderPlaced', updated_at = CURRENT_TIMESTAMP WHERE request_id = $1`,
      [requestId]
    );
    await writeAudit(pool, requestId, 'ORDER_PLACED', performed_by, 'PharmacistOrder', 'OrderPlaced', 'Drug order placed');
    res.json({ message: 'Order placed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/:id/mark-inventory-added', requireRole(ROLES.PHARMACIST), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const { inventory_item_name } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    if (!requestId) return res.status(400).json({ error: 'Request ID required.' });

    const reqResult = await pool.query(
      `SELECT status, current_stage FROM drug_requests WHERE request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    await pool.query(
      `UPDATE drug_requests
         SET inventory_added     = true,
             inventory_added_at  = CURRENT_TIMESTAMP,
             inventory_added_by  = $1,
             inventory_item_name = $2,
             updated_at          = CURRENT_TIMESTAMP
       WHERE request_id = $3`,
      [performed_by || null, inventory_item_name || null, requestId]
    );

    await writeAudit(
      pool, requestId, 'INVENTORY_ADDED', performed_by,
      'PharmacistOrder', reqResult.rows[0].current_stage,
      `Drug added to HIS inventory: ${inventory_item_name || 'unknown'}`
    );

    res.json({ success: true, message: 'Request marked as inventory-added.' });
  } catch (err) {
    console.error('PUT /api/requests/:id/mark-inventory-added error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.post('/:requestId/mark-inventory-received', requireRole(ROLES.PHARMACIST), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.requestId);
    const performed_by = req.user.id; // never trust a client-supplied performer id

    if (!requestId) return res.status(400).json({ error: 'Request ID required.' });

    const reqResult = await pool.query(
      `SELECT r.*, u.name AS doctor_name, u.department AS doctor_dept
       FROM drug_requests r
       JOIN users u ON u.user_id = r.doctor_id
       WHERE r.request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    const dr = reqResult.rows[0];

    if (dr.status !== 'ORDER_PLACED') {
      return res.status(400).json({
        error: 'Inventory can only be marked as received after the purchase order has been placed.'
      });
    }

    await pool.query(
      `UPDATE drug_requests
          SET status = 'INVENTORY_RECEIVED',
              current_stage = 'Completed',
              inventory_received = true,
              inventory_received_at = CURRENT_TIMESTAMP,
              inventory_received_by = $1,
              updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $2`,
      [performed_by || null, requestId]
    );

    await writeAudit(
      pool, requestId, 'INVENTORY_RECEIVED', performed_by,
      dr.current_stage, 'Completed',
      `Drug order received and stocked`
    );

    // Create notifications
    const brandName = dr.final_selected_brand || dr.brand_name;
    const msg = `✅ Ordered drug "${brandName}" for Request #${requestId} has been received and stocked. The workflow is now completed.`;

    // 1. Notify doctor
    await createNotification(pool, Number(dr.doctor_id), requestId, msg);

    // 2. Notify HOD if present
    if (dr.hod_id) {
      await createNotification(pool, Number(dr.hod_id), requestId, msg);
    }

    // 3. Notify CEO
    const ceoUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'CEO' AND is_active = true`
    );
    await createNotificationsBulk(pool, ceoUsers.rows.map(r => Number(r.user_id)), requestId, msg);

    // 4. Notify Pharmacists
    const pharmUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACIST' AND is_active = true`
    );
    await createNotificationsBulk(pool, pharmUsers.rows.map(r => Number(r.user_id)), requestId, msg);

    res.json({ success: true, message: 'Request marked as inventory received.' });
  } catch (err) {
    console.error('POST /api/requests/:requestId/mark-inventory-received error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.put('/:id/revert-to-pharmacist', requireRole(ROLES.PHARMACY_HEAD), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const { remarks } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    if (!remarks || remarks.trim() === '') {
      return res.status(400).json({ error: 'Revert remarks are mandatory.' });
    }

    const reqResult = await pool.query(
      `SELECT dr.*, u.name AS doctor_name FROM drug_requests dr
       JOIN users u ON u.user_id = dr.doctor_id
       WHERE dr.request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    const dr = reqResult.rows[0];
    if (dr.current_stage !== 'PharmacyHeadReview2') {
      return res.status(400).json({ error: 'Revert is only allowed during Pharmacy Head Review 2 stage.' });
    }

    await pool.query(
      `UPDATE drug_requests
       SET current_stage    = 'PharmacistCorrection',
           status           = 'REVERTED_FOR_CORRECTION',
           is_reverted      = true,
           revert_count     = COALESCE(revert_count, 0) + 1,
           revert_remarks   = $1,
           reverted_by      = $2,
           reverted_at      = CURRENT_TIMESTAMP,
           updated_at       = CURRENT_TIMESTAMP
       WHERE request_id = $3`,
      [remarks, performed_by, requestId]
    );

    await writeAudit(pool, requestId, 'REVERTED_TO_PHARMACIST', performed_by,
      'PharmacyHeadReview2', 'PharmacistCorrection', remarks);

    // Notify all Pharmacist users
    const pharmUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACIST' AND is_active = true`
    );
    await createNotificationsBulk(pool, pharmUsers.rows.map(r => Number(r.user_id)), requestId,
      `⚠️ Comparison sheet for Request #${requestId} (${dr.brand_name}) has been reverted by Pharmacy Head for correction. Reason: ${remarks.substring(0, 200)}`
    );

    // Doctor is not notified about internal pharmacist correction loop

    res.json({
      message: `Request #${requestId} reverted to Pharmacist for correction.`,
      new_stage: 'PharmacistCorrection',
      new_status: 'REVERTED_FOR_CORRECTION'
    });
  } catch (err) {
    console.error('PUT revert-to-pharmacist error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// Mirrors revert-to-pharmacist above, one stage earlier: DTC can send a
// request back to Pharmacy Head for further review/renegotiation instead
// of only being able to move it forward to CEO.
router.put('/:id/revert-to-pharmacy-head', requireRole('dtc', ROLES.DTC_COMMITTEE), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const { remarks } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    if (!remarks || remarks.trim() === '') {
      return res.status(400).json({ error: 'Revert remarks are mandatory.' });
    }

    const reqResult = await pool.query(
      `SELECT dr.*, u.name AS doctor_name FROM drug_requests dr
       JOIN users u ON u.user_id = dr.doctor_id
       WHERE dr.request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    const dr = reqResult.rows[0];
    if (dr.current_stage !== 'DTCFinal') {
      return res.status(400).json({ error: 'Revert is only allowed during DTC Final stage.' });
    }

    // Data consistency: once Pharmacy Head edits the comparison sheet
    // (that's the whole point of this revert), DTC's previously-selected
    // alternative may no longer exist or mean the same thing after
    // resubmission -- drug_alternatives rows get deleted and reinserted
    // with new alt_ids on any Pharmacy Head resubmission, so a stale
    // final_selected_alternative_id/dtc_final_recommendations reference
    // would point at IDs that don't exist anymore. Clear all of DTC's
    // structured selection data here so nothing dangling is left sitting
    // on the request between now and DTC's next real final-select call --
    // DTC re-reviews and re-selects fresh from the resubmitted sheet,
    // same as is_final_selected already naturally resets to false on new rows.
    await pool.query(
      `UPDATE drug_requests
       SET current_stage                  = 'PharmacyHeadReview2',
           status                         = 'REVERTED_BY_DTC',
           is_reverted                    = true,
           revert_count                   = COALESCE(revert_count, 0) + 1,
           revert_remarks                 = $1,
           reverted_by                    = $2,
           reverted_at                    = CURRENT_TIMESTAMP,
           dtc_final_recommendations      = NULL,
           dtc_selected_brand             = NULL,
           dtc_selected_category          = NULL,
           dtc_selection_reasons          = NULL,
           dtc_recommendation_notes       = NULL,
           final_selected_alternative_id  = NULL,
           dtc_final_selection_notes      = NULL,
           final_selected_brand           = NULL,
           final_selected_category        = NULL,
           final_selection_reasons        = NULL,
           final_recommendation_notes     = NULL,
           updated_at                     = CURRENT_TIMESTAMP
       WHERE request_id = $3`,
      [remarks, performed_by, requestId]
    );

    // is_final_selected flags are meaningless once the selection above is
    // cleared -- reset them too so nothing still shows as "DTC-selected"
    // until DTC actually re-confirms it against the resubmitted sheet.
    await pool.query(
      `UPDATE drug_alternatives SET is_final_selected = false WHERE request_id = $1`,
      [requestId]
    );

    await writeAudit(pool, requestId, 'REVERTED_TO_PHARMACY_HEAD', performed_by,
      'DTCFinal', 'PharmacyHeadReview2', remarks);

    // Notify all Pharmacy Head users
    const phUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACYHEAD' AND is_active = true`
    );
    await createNotificationsBulk(pool, phUsers.rows.map(r => Number(r.user_id)), requestId,
      `⚠️ Comparison sheet for Request #${requestId} (${dr.brand_name}) has been reverted by DTC for further review. Reason: ${remarks.substring(0, 200)}`
    );

    res.json({
      message: `Request #${requestId} reverted to Pharmacy Head for further review.`,
      new_stage: 'PharmacyHeadReview2',
      new_status: 'REVERTED_BY_DTC'
    });
  } catch (err) {
    console.error('PUT revert-to-pharmacy-head error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.put('/:id/resubmit-correction', requireRole(ROLES.PHARMACIST), async (req, res) => {
  const pool = getPgPool();
  try {
    const requestId = parseInt(req.params.id);
    const {
      alternatives,
      remarks,
      comparison_type,
      existing_generic_data
    } = req.body;
    const performed_by = req.user.id; // never trust a client-supplied performer id

    const reqResult = await pool.query(
      `SELECT dr.*, u.name AS doctor_name FROM drug_requests dr
       JOIN users u ON u.user_id = dr.doctor_id
       WHERE dr.request_id = $1`,
      [requestId]
    );
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found.' });

    const dr = reqResult.rows[0];
    if (dr.current_stage !== 'PharmacistCorrection') {
      return res.status(400).json({ error: 'Resubmit is only allowed from Pharmacist Correction stage.' });
    }

    // Save corrected alternatives if provided
    if (alternatives && alternatives.length > 0) {
      // Capture any existing Pharmacy Head negotiation data BEFORE deleting
      // drug_alternatives below. drug_alternative_negotiations.alternative_id
      // is ON DELETE CASCADE against drug_alternatives.alt_id, so without
      // this, every pharmacist correction would silently and permanently
      // destroy any rate/MRP/GST discount Pharmacy Head had already
      // negotiated -- with no warning to anyone. Matched by normalized
      // brand+manufacturer, since alt_id itself doesn't survive the
      // delete+reinsert (the corrected list may reorder/add/remove rows).
      const matchKey = (brand, mfr) => `${String(brand || '').trim().toLowerCase()}|${String(mfr || '').trim().toLowerCase()}`;
      const priorNegRes = await pool.query(
        `SELECT da.brand_name, da.manufacturer,
                dn.negotiated_mrp, dn.negotiated_rate, dn.negotiated_gst,
                dn.negotiated_scheme_qty, dn.negotiated_scheme_offer,
                dn.negotiated_net_rate, dn.negotiated_profit_margin,
                dn.negotiated_absolute_margin, dn.negotiated_total_margin,
                dn.negotiated_by, dn.negotiated_at, dn.negotiation_remarks
           FROM drug_alternatives da
           JOIN drug_alternative_negotiations dn ON dn.alternative_id = da.alt_id
          WHERE da.request_id = $1`,
        [requestId]
      );
      const priorNegByKey = new Map();
      for (const row of priorNegRes.rows) {
        priorNegByKey.set(matchKey(row.brand_name, row.manufacturer), row);
      }

      await pool.query(
        `DELETE FROM drug_alternatives WHERE request_id = $1`,
        [requestId]
      );

      // Was 1-2 round trips PER alternative (insert + conditional
      // negotiation-restore) -- batched into at most 2 round trips total:
      // (1) multi-row INSERT with RETURNING to get all new alt_ids back at
      // once, (2) multi-row INSERT for negotiation rows only for whichever
      // ones actually had prior negotiation data to restore.
      const altValues = [];
      const altTuples = alternatives.map((alt, i) => {
        const d = computeAltDerived(alt);
        const base = i * 25;
        altValues.push(
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
          comparison_type || 'new_generic',
          alt.remark || null,
          performed_by
        );
        const p = Array.from({ length: 25 }, (_, j) => `$${base + j + 1}`);
        return `(${p.join(', ')})`;
      });

      const altInsertResult = await pool.query(
        `INSERT INTO drug_alternatives (
           request_id, brand_name, manufacturer, marketer,
           mrp_per_pack, rate_per_pack, gst_percent,
           mrp, rate, qty, offer,
           markup_margin, net_rate, absolute_margin,
           negotiated_rate, profit_margin,
           stock, purchase_quantity,
           consultant, sale_qty, pack, introduced_on,
           comparison_type, remark, submitted_by
         ) VALUES ${altTuples.join(', ')}
         RETURNING alt_id`,
        altValues
      );

      const newAltIds = altInsertResult.rows.map(r => Number(r.alt_id));

      const negRowsToInsert = [];
      alternatives.forEach((alt, i) => {
        const priorNeg = priorNegByKey.get(matchKey(alt.brand_name, alt.manufacturer));
        if (priorNeg) {
          negRowsToInsert.push({ altId: newAltIds[i], priorNeg });
        }
      });

      if (negRowsToInsert.length > 0) {
        const negValues = [];
        const negTuples = negRowsToInsert.map(({ altId, priorNeg }, i) => {
          const base = i * 13;
          negValues.push(
            altId,
            priorNeg.negotiated_mrp,
            priorNeg.negotiated_rate,
            priorNeg.negotiated_gst,
            priorNeg.negotiated_scheme_qty,
            priorNeg.negotiated_scheme_offer,
            priorNeg.negotiated_net_rate,
            priorNeg.negotiated_profit_margin,
            priorNeg.negotiated_absolute_margin,
            priorNeg.negotiated_total_margin,
            priorNeg.negotiated_by,
            priorNeg.negotiated_at,
            priorNeg.negotiation_remarks
          );
          const p = Array.from({ length: 13 }, (_, j) => `$${base + j + 1}`);
          return `(${p.join(', ')})`;
        });

        await pool.query(
          `INSERT INTO drug_alternative_negotiations (
             alternative_id, negotiated_mrp, negotiated_rate, negotiated_gst,
             negotiated_scheme_qty, negotiated_scheme_offer, negotiated_net_rate,
             negotiated_profit_margin, negotiated_absolute_margin, negotiated_total_margin,
             negotiated_by, negotiated_at, negotiation_remarks
           ) VALUES ${negTuples.join(', ')}`,
          negValues
        );
      }
    }

    // Build the UPDATE statement with optional pharmacist_remarks and existing_generic_data
    const egdJson = existing_generic_data ? JSON.stringify(existing_generic_data) : null;
    await pool.query(
      `UPDATE drug_requests
       SET current_stage         = 'PharmacyHeadReview2',
           status                = 'Pending',
           is_reverted           = false,
           revert_remarks        = NULL,
           pharmacist_remarks    = CASE WHEN $1::text IS NOT NULL THEN $1 ELSE pharmacist_remarks END,
           existing_generic_data = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE existing_generic_data END,
           last_corrected_at     = CURRENT_TIMESTAMP,
           last_corrected_by     = $3,
           updated_at            = CURRENT_TIMESTAMP
       WHERE request_id = $4`,
      [remarks || null, egdJson, performed_by, requestId]
    );

    // Clean up analysis drafts for this pharmacist + request
    await pool.query(
      `DELETE FROM analysis_drafts
       WHERE request_id = $1 AND pharmacist_id = $2 AND status = 'DRAFT'`,
      [requestId, performed_by]
    );

    await writeAudit(pool, requestId, 'CORRECTION_RESUBMITTED', performed_by,
      'PharmacistCorrection', 'PharmacyHeadReview2',
      remarks || `Corrected comparison sheet resubmitted (revert #${dr.revert_count || 1})`);

    // Notify all PharmacyHead users
    const phUsers = await pool.query(
      `SELECT user_id FROM users WHERE UPPER(role) = 'PHARMACYHEAD' AND is_active = true`
    );
    await createNotificationsBulk(pool, phUsers.rows.map(r => Number(r.user_id)), requestId,
      `✅ Corrected comparison sheet for Request #${requestId} (${dr.brand_name}) has been resubmitted by Pharmacist. Please review.`
    );

    res.json({
      message: `Corrected comparison sheet for Request #${requestId} resubmitted to Pharmacy Head.`,
      new_stage: 'PharmacyHeadReview2',
      new_status: 'Pending'
    });
  } catch (err) {
    console.error('PUT resubmit-correction error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});


export default router;

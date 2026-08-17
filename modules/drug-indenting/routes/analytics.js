// Analytics routes — moved out of server.js unchanged, mounted at
// /api/analytics. Restricted to ceo/dtc/dtccommittee (or admin) per
// requireRole — see the AnalyticsDashboard import-chain evidence
// documented when these were originally secured.
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style conventions used app-wide.
//
// Real, file-specific note: every response here is hand-mapped from raw
// rows into new lowercase-keyed objects already (unlike
// pharmacistDrafts.js/users.js/admin.js, nothing here spreads a raw row
// directly) -- so no upperKeys() casing concern anywhere in this file.
// The real conversion risk instead: SUM(CASE WHEN ... THEN 1 ELSE 0 END)
// and COUNT(*) both produce Postgres BIGINT, which node-postgres returns
// as a STRING. Checked client/src/components/AnalyticsDashboard.js and
// found `docSort` genuinely sorts doctor-performance rows by
// total_requests -- a string "10" would sort before "9" lexicographically,
// a real, silent correctness bug, not just a cosmetic one. Every
// aggregate number in every endpoint below is explicitly Number()-
// converted for this reason.

import express from 'express';
import { getPgPool } from '../db/pgPool.js';
import { requireRole } from '../middleware/requireAuth.js';
import { ROLES } from '../utils/workflow.js';
import { cacheResponse } from '../utils/simpleCache.js';

const router = express.Router();

// This whole dashboard's aggregates were recomputed from scratch on every
// page load, even though nobody needs second-fresh numbers here -- a short
// TTL cuts repeated query load with staleness nobody would ever notice.
const CACHE_TTL_MS = 30 * 1000;

router.get('/summary', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS total_pending,
        SUM(CASE WHEN status IN ('Approved','HOD_APPROVED','APPROVED_PENDING_ORDER','EMERGENCY_APPROVED','INVENTORY_RECEIVED') THEN 1 ELSE 0 END) AS total_approved,
        SUM(CASE WHEN status IN ('Rejected','HOD_REJECTED','PHARMACIST_REJECTED','PHARMACY_HEAD_REJECTED','PHARMACY_HEAD_REJECTED_PENDING_DTC','PHARMACIST_REJECTED_PENDING_DTC','CEO_REJECTED','EMERGENCY_REJECTED') THEN 1 ELSE 0 END) AS total_rejected,
        SUM(CASE WHEN status IN ('EMERGENCY_PENDING_DTC','EMERGENCY_APPROVED','EMERGENCY_REJECTED') THEN 1 ELSE 0 END) AS total_emergency,
        SUM(CASE WHEN status IN ('ORDER_PLACED','INVENTORY_RECEIVED') OR current_stage = 'OrderPlaced' THEN 1 ELSE 0 END) AS total_order_placed,
        SUM(CASE WHEN current_stage = 'Final' THEN 1 ELSE 0 END) AS total_final_approved,
        SUM(CASE WHEN current_stage IN ('DTCCommittee','DTCFinal','EmergencyDTC') THEN 1 ELSE 0 END) AS total_dtc_review,
        SUM(CASE WHEN current_stage = 'CEO' THEN 1 ELSE 0 END) AS total_ceo_review,
        SUM(CASE WHEN request_source_type = 'NON_PROMOTIONAL' THEN 1 ELSE 0 END) AS total_clinical,
        SUM(CASE WHEN request_source_type = 'PROMOTIONAL' OR request_source_type IS NULL THEN 1 ELSE 0 END) AS total_via_rep,
        SUM(CASE WHEN formulary_request_type = 'FORMULARY' THEN 1 ELSE 0 END) AS total_formulary,
        SUM(CASE WHEN formulary_request_type = 'NON_FORMULARY' THEN 1 ELSE 0 END) AS total_non_formulary
      FROM drug_requests
    `);
    const row = r.rows[0];
    res.json({
      total_requests: Number(row.total_requests),
      total_pending: Number(row.total_pending),
      total_approved: Number(row.total_approved),
      total_rejected: Number(row.total_rejected),
      total_emergency: Number(row.total_emergency),
      total_order_placed: Number(row.total_order_placed),
      total_final_approved: Number(row.total_final_approved),
      total_dtc_review: Number(row.total_dtc_review),
      total_ceo_review: Number(row.total_ceo_review),
      total_clinical: Number(row.total_clinical),
      total_via_rep: Number(row.total_via_rep),
      total_formulary: Number(row.total_formulary),
      total_non_formulary: Number(row.total_non_formulary),
    });
  } catch (err) {
    console.error('GET analytics/summary error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/analytics/workflow-stages — Count per workflow stage
router.get('/workflow-stages', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  try {
    const r = await pool.query(`
      SELECT current_stage, COUNT(*) AS cnt
      FROM drug_requests
      GROUP BY current_stage
      ORDER BY cnt DESC
    `);
    res.json(r.rows.map(row => ({ stage: row.current_stage, count: Number(row.cnt) })));
  } catch (err) {
    console.error('GET analytics/workflow-stages error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/analytics/doctor-performance — Per-doctor/HOD analytics
router.get('/doctor-performance', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  try {
    const r = await pool.query(`
      SELECT
        u.user_id,
        u.name,
        u.role,
        u.department,
        COUNT(dr.request_id) AS total_requests,
        SUM(CASE WHEN dr.status IN ('Approved','HOD_APPROVED','APPROVED_PENDING_ORDER','EMERGENCY_APPROVED','INVENTORY_RECEIVED') THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN dr.status IN ('Rejected','HOD_REJECTED','PHARMACIST_REJECTED','PHARMACY_HEAD_REJECTED','CEO_REJECTED','EMERGENCY_REJECTED') THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN dr.status = 'Pending' OR dr.status LIKE '%PENDING%' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN dr.status IN ('EMERGENCY_PENDING_DTC','EMERGENCY_APPROVED','EMERGENCY_REJECTED') THEN 1 ELSE 0 END) AS emergency_count,
        MAX(dr.created_at) AS latest_request
      FROM users u
      LEFT JOIN drug_requests dr ON dr.created_by_user_id = u.user_id
      WHERE LOWER(u.role) IN ('doctor','hod') AND u.is_active = true
      GROUP BY u.user_id, u.name, u.role, u.department
      ORDER BY total_requests DESC
    `);
    res.json(r.rows.map(row => ({
      user_id: Number(row.user_id),
      name: row.name,
      role: row.role,
      department: row.department || '—',
      total_requests: Number(row.total_requests),
      approved: Number(row.approved),
      rejected: Number(row.rejected),
      pending: Number(row.pending),
      emergency_count: Number(row.emergency_count),
      latest_request: row.latest_request,
    })));
  } catch (err) {
    console.error('GET analytics/doctor-performance error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/analytics/drug-analytics — Top drugs by requests/approvals/rejections
router.get('/drug-analytics', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  try {
    const [topBrands, topGenerics, topRejected, topApproved] = await Promise.all([
      pool.query(`
        SELECT brand_name, COUNT(*) AS cnt FROM drug_requests
        WHERE brand_name IS NOT NULL
        GROUP BY brand_name ORDER BY cnt DESC FETCH FIRST 10 ROWS ONLY
      `),
      pool.query(`
        SELECT generic_name, COUNT(*) AS cnt FROM drug_requests
        WHERE generic_name IS NOT NULL
        GROUP BY generic_name ORDER BY cnt DESC FETCH FIRST 10 ROWS ONLY
      `),
      pool.query(`
        SELECT brand_name, COUNT(*) AS cnt FROM drug_requests
        WHERE status IN ('Rejected','HOD_REJECTED','PHARMACIST_REJECTED','PHARMACY_HEAD_REJECTED','CEO_REJECTED','EMERGENCY_REJECTED')
        AND brand_name IS NOT NULL
        GROUP BY brand_name ORDER BY cnt DESC FETCH FIRST 10 ROWS ONLY
      `),
      pool.query(`
        SELECT brand_name, COUNT(*) AS cnt FROM drug_requests
        WHERE status IN ('Approved','APPROVED_PENDING_ORDER','ORDER_PLACED','EMERGENCY_APPROVED')
        AND brand_name IS NOT NULL
        GROUP BY brand_name ORDER BY cnt DESC FETCH FIRST 10 ROWS ONLY
      `),
    ]);
    res.json({
      top_brands: topBrands.rows.map(r => ({ name: r.brand_name, count: Number(r.cnt) })),
      top_generics: topGenerics.rows.map(r => ({ name: r.generic_name, count: Number(r.cnt) })),
      top_rejected: topRejected.rows.map(r => ({ name: r.brand_name, count: Number(r.cnt) })),
      top_approved: topApproved.rows.map(r => ({ name: r.brand_name, count: Number(r.cnt) })),
    });
  } catch (err) {
    console.error('GET analytics/drug-analytics error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/analytics/rejection-breakdown — Rejections per stage + top remarks
router.get('/rejection-breakdown', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  try {
    const [breakdown, remarks] = await Promise.all([
      pool.query(`
        SELECT
          SUM(CASE WHEN status = 'HOD_REJECTED' THEN 1 ELSE 0 END) AS rejected_by_hod,
          SUM(CASE WHEN status IN ('PHARMACY_HEAD_REJECTED','PHARMACY_HEAD_REJECTED_PENDING_DTC') THEN 1 ELSE 0 END) AS rejected_by_ph,
          SUM(CASE WHEN status IN ('Rejected','PHARMACIST_REJECTED') AND current_stage IN ('DTCCommittee','DTCFinal','EmergencyDTC','Pharmacist','PharmacyHeadReview2') THEN 1 ELSE 0 END) AS rejected_by_dtc,
          SUM(CASE WHEN status = 'CEO_REJECTED' THEN 1 ELSE 0 END) AS rejected_by_ceo,
          SUM(CASE WHEN status = 'EMERGENCY_REJECTED' THEN 1 ELSE 0 END) AS rejected_emergency
        FROM drug_requests
      `),
      pool.query(`
        SELECT remarks, COUNT(*) AS cnt
        FROM rejection_remark_history
        WHERE remarks IS NOT NULL AND TRIM(remarks) != ''
        GROUP BY remarks ORDER BY cnt DESC FETCH FIRST 10 ROWS ONLY
      `).catch(() => ({ rows: [] })),
    ]);
    const b = breakdown.rows[0];
    res.json({
      rejected_by_hod: Number(b.rejected_by_hod),
      rejected_by_ph: Number(b.rejected_by_ph),
      rejected_by_dtc: Number(b.rejected_by_dtc),
      rejected_by_ceo: Number(b.rejected_by_ceo),
      rejected_emergency: Number(b.rejected_emergency),
      top_remarks: remarks.rows.map(r => ({ remark: r.remarks, count: Number(r.cnt) })),
    });
  } catch (err) {
    console.error('GET analytics/rejection-breakdown error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/analytics/request-history — Paginated full request list
router.get('/request-history', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim().toLowerCase();
    const stageFilter = (req.query.stage || '').trim();

    // Shared positional binds across the data query and the count query
    // -- same addParam pattern as routes/dashboard.js, since the WHERE
    // clause (and its bound values) is built once and reused by both.
    let whereClause = '1=1';
    const values = [];
    function addParam(val) {
      values.push(val);
      return `$${values.length}`;
    }

    if (search) {
      const p = addParam(search);
      whereClause += ` AND (LOWER(dr.brand_name) LIKE '%' || ${p} || '%' OR LOWER(u.name) LIKE '%' || ${p} || '%' OR LOWER(dr.generic_name) LIKE '%' || ${p} || '%')`;
    }
    if (stageFilter) {
      whereClause += ` AND dr.current_stage = ${addParam(stageFilter)}`;
    }
    const countValues = [...values];

    const limitParam = addParam(limit);
    const offsetParam = addParam(offset);

    const [dataRes, countRes] = await Promise.all([
      pool.query(`
        SELECT
          dr.request_id, u.name AS doctor_name, u.department,
          dr.brand_name, dr.generic_name, dr.dosage_form, dr.dose_strength,
          dr.request_source_type, dr.formulary_request_type,
          dr.current_stage, dr.status, dr.created_at, dr.effective_created_at,
          dr.dtc_selected_brand, dr.created_by_role
        FROM drug_requests dr
        LEFT JOIN users u ON u.user_id = dr.created_by_user_id
        WHERE ${whereClause}
        ORDER BY dr.request_id DESC
        OFFSET ${offsetParam} ROWS FETCH NEXT ${limitParam} ROWS ONLY
      `, values),
      pool.query(`
        SELECT COUNT(*) AS total
        FROM drug_requests dr
        LEFT JOIN users u ON u.user_id = dr.created_by_user_id
        WHERE ${whereClause}
      `, countValues),
    ]);

    const total = Number(countRes.rows[0].total);
    res.json({
      data: dataRes.rows.map(r => ({
        request_id: Number(r.request_id),
        doctor_name: r.doctor_name || '—',
        department: r.department || '—',
        brand_name: r.brand_name,
        generic_name: r.generic_name,
        dosage_form: r.dosage_form,
        dose_strength: r.dose_strength,
        request_source_type: r.request_source_type,
        formulary_request_type: r.formulary_request_type,
        current_stage: r.current_stage,
        status: r.status,
        created_at: r.created_at,
        effective_created_at: r.effective_created_at,
        dtc_selected_brand: r.dtc_selected_brand,
        created_by_role: r.created_by_role,
      })),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('GET analytics/request-history error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/analytics/workflow-tracker — Live workflow tracking
router.get('/workflow-tracker', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  const role = (req.query.role || '').toLowerCase();
  const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

  try {
    let whereClause = '1=1';
    const values = [];

    if (role === ROLES.DOCTOR && userId) {
      whereClause = '(dr.doctor_id = $1 OR dr.created_by_user_id = $1)';
      values.push(userId);
    } else if (role === ROLES.HOD && userId) {
      whereClause = `(dr.hod_id = $1
        OR dr.created_by_user_id = $1
        OR u.department = (SELECT department FROM users WHERE user_id = $1))`;
      values.push(userId);
    }

    const query = `
      SELECT
        dr.request_id,
        u.name AS requester_name,
        dr.created_by_role AS requester_role,
        u.department,
        dr.brand_name,
        dr.generic_name,
        dr.current_stage,
        dr.status,
        dr.is_reverted,
        dr.created_at,
        dr.updated_at
      FROM drug_requests dr
      JOIN users u ON u.user_id = dr.doctor_id
      WHERE ${whereClause}
      ORDER BY dr.request_id DESC
    `;

    const result = await pool.query(query, values);

    const data = result.rows.map(row => {
      const dbStage = row.current_stage;
      const status = row.status;
      // Real boolean from Postgres now -- no `=== 1` comparison needed.
      const isReverted = row.is_reverted;

      // Map DB stage to standard key
      let stageKey = 'pharmacy_head_review1'; // fallback
      if (dbStage === 'HOD') stageKey = 'hod';
      else if (['PharmacistInitialReview', 'PharmacistCorrection', 'PharmacistReview1'].includes(dbStage)) stageKey = 'pharmacist_initial';
      else if (['PharmacyHead', 'PharmacyHeadReview1'].includes(dbStage)) stageKey = 'pharmacy_head_review1';
      else if (['DTCCommittee', 'DTCReview1', 'EmergencyDTC'].includes(dbStage)) stageKey = 'dtc_review1';
      else if (['Pharmacist', 'PharmacistReview2'].includes(dbStage)) stageKey = 'pharmacist_analysis';
      else if (dbStage === 'PharmacyHeadReview2') stageKey = 'pharmacy_head_review2';
      else if (['DTCFinal', 'DTCFinalReview'].includes(dbStage)) stageKey = 'dtc_final';
      else if (dbStage === 'CEO') stageKey = 'ceo';
      else if (['PharmacistOrder', 'APPROVED_PENDING_ORDER', 'OrderPlaced', 'Final'].includes(dbStage) || status === 'ORDER_PLACED' || status === 'Approved') stageKey = 'order_placed';

      // Let's determine owner
      let currentOwner = 'Pharmacy Head';
      if (status && (status.toLowerCase().includes('rejected') || status === 'Rejected')) {
        currentOwner = 'Rejected';
      } else if (stageKey === 'order_placed' && (status === 'ORDER_PLACED' || status === 'Approved')) {
        currentOwner = 'Completed';
      } else {
        if (stageKey === 'hod') currentOwner = 'HOD';
        else if (stageKey === 'pharmacist_initial' || stageKey === 'pharmacist_analysis' || stageKey === 'order_placed') currentOwner = 'Pharmacist';
        else if (stageKey === 'pharmacy_head_review1' || stageKey === 'pharmacy_head_review2') currentOwner = 'Pharmacy Head';
        else if (stageKey === 'dtc_review1' || stageKey === 'dtc_final') currentOwner = 'DTC';
        else if (stageKey === 'ceo') currentOwner = 'CEO';
      }

      // Calculate days in stage
      const lastActionDate = row.updated_at || row.created_at;
      const diffTime = Math.max(0, new Date() - new Date(lastActionDate));
      const daysInStage = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // Build workflow progress
      const STAGE_ORDER = [
        'hod',
        'pharmacist_initial',
        'pharmacy_head_review1',
        'dtc_review1',
        'pharmacist_analysis',
        'pharmacy_head_review2',
        'dtc_final',
        'ceo',
        'order_placed'
      ];

      const workflowProgress = {
        hod: false,
        pharmacist_initial: false,
        pharmacy_head_review1: false,
        dtc_review1: false,
        pharmacist_analysis: false,
        pharmacy_head_review2: false,
        dtc_final: false,
        ceo: false,
        order_placed: false
      };

      const currentIdx = STAGE_ORDER.indexOf(stageKey);
      if (currentIdx !== -1) {
        for (let i = 0; i <= currentIdx; i++) {
          workflowProgress[STAGE_ORDER[i]] = true;
        }
      }

      // Format stage string for output
      let stageString = 'PHARMACY_HEAD';
      if (stageKey === 'hod') stageString = 'HOD';
      else if (stageKey === 'pharmacist_initial') stageString = 'PHARMACIST_INITIAL';
      else if (stageKey === 'pharmacy_head_review1') stageString = 'PHARMACY_HEAD';
      else if (stageKey === 'dtc_review1') stageString = 'DTC_REVIEW1';
      else if (stageKey === 'pharmacist_analysis') stageString = 'PHARMACIST_ANALYSIS';
      else if (stageKey === 'pharmacy_head_review2') stageString = 'PHARMACY_HEAD_REVIEW2';
      else if (stageKey === 'dtc_final') stageString = 'DTC_FINAL';
      else if (stageKey === 'ceo') stageString = 'CEO';
      else if (stageKey === 'order_placed') stageString = 'ORDER_PLACED';

      return {
        request_id: Number(row.request_id),
        requester_name: row.requester_name || '—',
        requester_role: row.requester_role || ROLES.DOCTOR,
        department: row.department || '—',
        brand_name: row.brand_name,
        generic_name: row.generic_name,
        current_stage: stageString,
        current_owner: currentOwner,
        status: status,
        is_reverted: isReverted,
        days_in_stage: daysInStage,
        created_date: row.created_at,
        last_action_date: lastActionDate,
        workflow_progress: workflowProgress
      };
    });

    res.json(data);
  } catch (err) {
    console.error('GET workflow-tracker error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/analytics/audit-trail — Global request audit trail
router.get('/audit-trail', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  const role = (req.query.role || '').toLowerCase();
  const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

  try {
    let whereClause = '1=1';
    const values = [];

    if (role === ROLES.DOCTOR && userId) {
      whereClause = '(dr.doctor_id = $1 OR dr.created_by_user_id = $1)';
      values.push(userId);
    } else if (role === ROLES.HOD && userId) {
      whereClause = `(dr.hod_id = $1
        OR dr.created_by_user_id = $1
        OR u.department = (SELECT department FROM users WHERE user_id = $1))`;
      values.push(userId);
    }

    const query = `
      SELECT
        al.log_id,
        al.request_id,
        al.action,
        al.from_stage,
        al.to_stage,
        al.remarks,
        al.logged_at,
        u_perf.name AS performer_name,
        u_perf.role AS performer_role,
        dr.brand_name,
        dr.generic_name
      FROM audit_logs al
      JOIN users u_perf ON u_perf.user_id = al.performed_by
      JOIN drug_requests dr ON dr.request_id = al.request_id
      JOIN users u ON u.user_id = dr.doctor_id
      WHERE ${whereClause}
      ORDER BY al.logged_at DESC
      OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY
    `;

    const result = await pool.query(query, values);
    let rows = result.rows.map(row => ({
      log_id: Number(row.log_id),
      request_id: Number(row.request_id),
      action: row.action,
      from_stage: row.from_stage,
      to_stage: row.to_stage,
      remarks: row.remarks,
      logged_at: row.logged_at,
      performer_name: row.performer_name,
      performer_role: row.performer_role,
      brand_name: row.brand_name,
      generic_name: row.generic_name,
    }));

    // Filter out internal stages for doctor and HOD roles
    if (role === ROLES.DOCTOR || role === ROLES.HOD) {
      const internalStages = [
        'PharmacistInitialReview',
        'PharmacistCorrection',
        'PharmacyHead',
        'PharmacyHeadReview1',
        'Pharmacist',
        'PharmacistReview2',
        'PharmacyHeadReview2'
      ];
      rows = rows.filter(row => {
        const fromStage = row.from_stage;
        const toStage = row.to_stage;
        const action = row.action;
        if (action === 'REVERTED_TO_PHARMACIST') return false;
        if (internalStages.includes(fromStage) || internalStages.includes(toStage)) return false;
        return true;
      });
    }

    res.json(rows);
  } catch (err) {
    console.error('GET global audit-trail error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/analytics/drilldown — Drilldown for metric or stage click
router.get('/drilldown', requireRole(ROLES.CEO, 'dtc', ROLES.DTC_COMMITTEE), cacheResponse(CACHE_TTL_MS), async (req, res) => {
  const pool = getPgPool();
  try {
    const type = req.query.type;
    const key = req.query.key;
    if (!type || !key) {
      return res.status(400).json({ error: 'Missing type or key parameter.' });
    }

    let whereClause = '1=1';
    const values = [];

    if (type === 'metric') {
      if (key === 'total_requests') {
        whereClause = '1=1';
      } else if (key === 'total_pending') {
        whereClause = "dr.status = 'Pending' OR dr.status LIKE '%PENDING%'";
      } else if (key === 'total_approved') {
        whereClause = "dr.status IN ('Approved','HOD_APPROVED','APPROVED_PENDING_ORDER','EMERGENCY_APPROVED','INVENTORY_RECEIVED')";
      } else if (key === 'total_rejected') {
        whereClause = "dr.status IN ('Rejected','HOD_REJECTED','PHARMACIST_REJECTED','PHARMACY_HEAD_REJECTED','PHARMACY_HEAD_REJECTED_PENDING_DTC','PHARMACIST_REJECTED_PENDING_DTC','CEO_REJECTED','EMERGENCY_REJECTED')";
      } else if (key === 'total_emergency') {
        whereClause = "dr.status IN ('EMERGENCY_PENDING_DTC','EMERGENCY_APPROVED','EMERGENCY_REJECTED')";
      } else if (key === 'total_order_placed') {
        whereClause = "dr.status IN ('ORDER_PLACED','INVENTORY_RECEIVED') OR dr.current_stage = 'OrderPlaced'";
      } else if (key === 'total_final_approved') {
        whereClause = "dr.current_stage = 'Final'";
      } else if (key === 'total_dtc_review') {
        whereClause = "dr.current_stage IN ('DTCCommittee','DTCFinal','EmergencyDTC')";
      } else if (key === 'total_ceo_review') {
        whereClause = "dr.current_stage = 'CEO'";
      } else if (key === 'total_clinical') {
        whereClause = "dr.request_source_type = 'NON_PROMOTIONAL'";
      } else if (key === 'total_via_rep') {
        whereClause = "dr.request_source_type = 'PROMOTIONAL' OR dr.request_source_type IS NULL";
      } else if (key === 'total_formulary') {
        whereClause = "dr.formulary_request_type = 'FORMULARY'";
      } else if (key === 'total_non_formulary') {
        whereClause = "dr.formulary_request_type = 'NON_FORMULARY'";
      }
    } else if (type === 'stage') {
      if (key === 'Rejected') {
        whereClause = "dr.current_stage = 'Rejected' OR dr.status IN ('Rejected','HOD_REJECTED','PHARMACIST_REJECTED','PHARMACY_HEAD_REJECTED','PHARMACY_HEAD_REJECTED_PENDING_DTC','PHARMACIST_REJECTED_PENDING_DTC','CEO_REJECTED','EMERGENCY_REJECTED')";
      } else if (key === 'EmergencyDTC') {
        whereClause = "dr.current_stage = 'EmergencyDTC' OR dr.status IN ('EMERGENCY_PENDING_DTC','EMERGENCY_APPROVED','EMERGENCY_REJECTED')";
      } else {
        whereClause = "dr.current_stage = $1";
        values.push(key);
      }
    }

    const query = `
      SELECT
        dr.request_id,
        u.name AS doctor_name,
        u.department,
        dr.brand_name,
        dr.generic_name,
        dr.dosage_form,
        dr.dose_strength,
        dr.request_source_type,
        dr.current_stage,
        dr.status,
        dr.created_at,
        dr.dtc_selected_brand,
        (SELECT remarks FROM audit_logs WHERE request_id = dr.request_id AND action = 'REJECTED' ORDER BY logged_at DESC FETCH FIRST 1 ROWS ONLY) AS rejection_remarks,
        (SELECT remarks FROM audit_logs WHERE request_id = dr.request_id AND action = 'ORDER_PLACED' ORDER BY logged_at DESC FETCH FIRST 1 ROWS ONLY) AS order_remarks
      FROM drug_requests dr
      LEFT JOIN users u ON u.user_id = COALESCE(dr.created_by_user_id, dr.doctor_id)
      WHERE ${whereClause}
      ORDER BY dr.request_id DESC
    `;

    const result = await pool.query(query, values);
    res.json(result.rows.map(r => ({
      request_id: Number(r.request_id),
      doctor_name: r.doctor_name || '—',
      department: r.department || '—',
      brand_name: r.brand_name,
      generic_name: r.generic_name,
      dosage_form: r.dosage_form,
      dose_strength: r.dose_strength,
      request_source_type: r.request_source_type,
      current_stage: r.current_stage,
      status: r.status,
      created_at: r.created_at,
      dtc_selected_brand: r.dtc_selected_brand,
      rejection_remarks: r.rejection_remarks || '—',
      order_remarks: r.order_remarks || '—'
    })));
  } catch (err) {
    console.error('GET analytics/drilldown error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

export default router;

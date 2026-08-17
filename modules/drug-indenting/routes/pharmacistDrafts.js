// Pharmacist drafts routes — moved out of server.js unchanged, mounted
// at /api/pharmacist/drafts in server.js (so paths here are relative to
// that). Route order preserved exactly as it was in server.js.
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style conventions used app-wide.
//
// Real, file-specific decision: the GET endpoints below spread raw
// query-result rows directly into their JSON response (`{ ...row, ... }`),
// which means the response's key CASING is part of the real API
// contract, not just internal code -- checked client/src/components/
// PharmacistTab.js and found it genuinely depends on Oracle's original
// UPPERCASE row casing in several places (destructuring `DRAFT_ID`,
// `DRAFT_DATA` with no fallback). So unlike auth.js/dashboard.js (where
// nothing depended on the old representation and it was safe to
// modernize), these three GET endpoints explicitly re-uppercase their
// response keys to preserve the exact existing wire format. POST '/' is
// different again -- its response was always hand-built with lowercase
// keys (not spread from a raw row), which the frontend already reads as
// lowercase, so it's left as-is; nothing to preserve there since it was
// never uppercase to begin with.

import express from 'express';
import { getPgPool } from '../db/pgPool.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// Re-uppercases a query-result row's keys, to preserve the exact JSON
// response shape the frontend already depends on for these three GET
// endpoints (see file header). Oracle uppercased every column
// unconditionally, so this mirrors that unconditionally too.
function upperKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.toUpperCase()] = v;
  return out;
}

// POST /api/pharmacist/drafts
router.post('/', requireAuth, async (req, res) => {
  const { request_id, pharmacist_id, draft_name } = req.body;
  if (!request_id || !pharmacist_id) return res.status(400).json({ error: 'request_id and pharmacist_id are required.' });
  if (req.user.id !== Number(pharmacist_id)) {
    return res.status(403).json({ error: 'You can only save drafts as yourself.' });
  }

  const pool = getPgPool();
  try {
    console.log('Saving draft for request', request_id, 'pharmacist', pharmacist_id);

    // Build the draft data object: everything except the three metadata keys
    const dataObj = { ...req.body };
    delete dataObj.request_id;
    delete dataObj.pharmacist_id;
    delete dataObj.draft_name;
    const draftData = JSON.stringify(dataObj);

    // Auto-generate a sensible draft name when none is provided
    const alts = req.body.alternatives;
    const name = draft_name?.trim() ||
      (Array.isArray(alts) ? alts.find(a => a.brand_name?.trim())?.brand_name?.trim() : undefined) ||
      `Draft - Request #${request_id}`;

    const existing = await pool.query(
      `SELECT draft_id FROM analysis_drafts WHERE request_id = $1 AND pharmacist_id = $2 AND status = 'DRAFT'`,
      [request_id, pharmacist_id]
    );

    let draftId;
    if (existing.rows.length > 0) {
      draftId = Number(existing.rows[0].draft_id);
      await pool.query(
        `UPDATE analysis_drafts
           SET draft_name = $1, draft_data = $2, updated_at = CURRENT_TIMESTAMP
         WHERE draft_id = $3`,
        [name, draftData, draftId]
      );
      console.log('Draft updated, draft_id:', draftId);
    } else {
      const inserted = await pool.query(
        `INSERT INTO analysis_drafts (request_id, pharmacist_id, draft_name, draft_data, status)
         VALUES ($1, $2, $3, $4, 'DRAFT')
         RETURNING draft_id`,
        [request_id, pharmacist_id, name, draftData]
      );
      draftId = Number(inserted.rows[0].draft_id);
      console.log('Draft inserted, draft_id:', draftId);
    }
    res.json({ success: true, draft_id: draftId, draft_name: name, message: 'Draft saved successfully.' });
  } catch (err) {
    console.error('POST /api/pharmacist/drafts error:', err);
    res.status(500).json({ success: false, error: 'Failed to save draft.', detail: err.message });
  }
});

// GET /api/pharmacist/drafts/for-request/:requestId/:pharmacistId
router.get('/for-request/:requestId/:pharmacistId', requireAuth, async (req, res) => {
  const { requestId, pharmacistId } = req.params;
  if (req.user.id !== Number(pharmacistId)) {
    return res.status(403).json({ error: 'You are not authorized to view these drafts.' });
  }

  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT draft_id, draft_name, draft_data, updated_at
       FROM analysis_drafts
       WHERE request_id = $1 AND pharmacist_id = $2 AND status = 'DRAFT'
       ORDER BY updated_at DESC FETCH FIRST 1 ROWS ONLY`,
      [parseInt(requestId), parseInt(pharmacistId)]
    );
    if (!result.rows.length) return res.json(null);
    const row = result.rows[0];
    // draft_data is a plain TEXT column now -- Postgres has no CLOB/
    // fetchAsString distinction to configure, it's just a string already.
    let parsed = {};
    try { parsed = row.draft_data ? JSON.parse(row.draft_data) : {}; } catch { parsed = {}; }
    res.json({ ...upperKeys(row), DRAFT_DATA: parsed });
  } catch (err) {
    console.error('GET /api/pharmacist/drafts/for-request error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/pharmacist/drafts/:pharmacistId — list all DRAFT records for a pharmacist
// Returns additional request columns (request_type, current_stage, req_status) and
// parses draft_data so the frontend can read comp_type for the Comparison Type column.
router.get('/:pharmacistId', requireAuth, async (req, res) => {
  const pid = parseInt(req.params.pharmacistId);
  if (req.user.id !== pid) {
    return res.status(403).json({ error: 'You are not authorized to view these drafts.' });
  }

  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT ad.draft_id, ad.request_id, ad.draft_name, ad.status,
              ad.created_at, ad.updated_at, ad.draft_data,
              dr.brand_name, dr.generic_name, dr.category,
              dr.request_type, dr.current_stage, dr.status AS req_status
       FROM analysis_drafts ad
       JOIN drug_requests dr ON dr.request_id = ad.request_id
       WHERE ad.pharmacist_id = $1 AND ad.status = 'DRAFT'
       ORDER BY ad.updated_at DESC`,
      [pid]
    );
    // Parse draft_data for each row so the frontend can read comp_type inline
    const list = result.rows.map(row => {
      let parsed = {};
      try { parsed = row.draft_data ? JSON.parse(row.draft_data) : {}; } catch { parsed = {}; }
      return { ...upperKeys(row), DRAFT_DATA: parsed };
    });
    res.json(list);
  } catch (err) {
    console.error('GET /api/pharmacist/drafts error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// GET /api/pharmacist/drafts/detail/:draftId
router.get('/detail/:draftId', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const did = parseInt(req.params.draftId);
    const result = await pool.query(
      `SELECT ad.*, dr.brand_name, dr.generic_name, dr.category, dr.request_type
       FROM analysis_drafts ad
       JOIN drug_requests dr ON dr.request_id = ad.request_id
       WHERE ad.draft_id = $1`,
      [did]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Draft not found.' });
    const row = result.rows[0];
    // analysis_drafts.pharmacist_id is BIGINT -> pg returns it as a
    // string (see routes/auth.js's dbUserId comment for the full
    // reasoning). Number(...) so this isn't comparing a string to
    // req.user.id's real number.
    if (Number(row.pharmacist_id) !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to view this draft.' });
    }
    let parsed = {};
    try { parsed = row.draft_data ? JSON.parse(row.draft_data) : {}; } catch { parsed = {}; }
    res.json({ ...upperKeys(row), DRAFT_DATA: parsed });
  } catch (err) {
    console.error('GET /api/pharmacist/drafts/detail error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// PUT /api/pharmacist/drafts/:draftId — rename draft
router.put('/:draftId', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const did = parseInt(req.params.draftId);
    const ownerCheck = await pool.query(
      `SELECT pharmacist_id FROM analysis_drafts WHERE draft_id = $1`,
      [did]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found.' });
    }
    if (Number(ownerCheck.rows[0].pharmacist_id) !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to modify this draft.' });
    }

    const { draft_name } = req.body;
    await pool.query(
      `UPDATE analysis_drafts SET draft_name = $1, updated_at = CURRENT_TIMESTAMP WHERE draft_id = $2`,
      [draft_name?.trim() || null, did]
    );
    res.json({ message: 'Draft renamed.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

// DELETE /api/pharmacist/drafts/:draftId — delete draft
router.delete('/:draftId', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const did = parseInt(req.params.draftId);
    const ownerCheck = await pool.query(
      `SELECT pharmacist_id FROM analysis_drafts WHERE draft_id = $1`,
      [did]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found.' });
    }
    if (Number(ownerCheck.rows[0].pharmacist_id) !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to delete this draft.' });
    }

    await pool.query(`DELETE FROM analysis_drafts WHERE draft_id = $1`, [did]);
    res.json({ message: 'Draft deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

export default router;

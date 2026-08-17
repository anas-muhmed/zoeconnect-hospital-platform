// Core registration/login routes — moved out of server.js unchanged,
// mounted at the API root (/api) since these are /api/register and
// /api/login specifically, not under a shared prefix of their own.
// Both are intentionally public — no token exists yet at this point.
//
// CONVERTED to Postgres (migration/oracle-to-postgres) — see
// migration/docs/route-conversion-plan.md for the full reasoning behind
// every dialect/bind/type choice made here. This was the first route
// file converted; treat this file's patterns as the reference for
// converting the rest.

import express from 'express';
import bcrypt from 'bcrypt';
import { getPgPool } from '../db/pgPool.js';
import { signToken, normalizeRole, SALT_ROUNDS } from '../utils/auth.js';
import { validatePassword } from '../utils/pureHelpers.js';
import { ROLES } from '../utils/workflow.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, email, password, role, department, user_login_id } = req.body;

  // ── 1. Basic presence checks ──────────────────────────────────────────────
  if (!name || !email || !password || !role || !user_login_id) {
    return res.status(400).json({
      success: false,
      message: 'name, email, password, role, and user_login_id are required.',
    });
  }

  // ── 1.1 User ID validation ────────────────────────────────────────────────
  const normalizedUserId = user_login_id.toLowerCase().trim();
  const userIdRegex = /^[a-zA-Z0-9._-]{1,30}$/;
  if (!userIdRegex.test(normalizedUserId)) {
    return res.status(400).json({
      success: false,
      message: 'User ID must be 1-30 alphanumeric characters, including underscores, dots, or hyphens, and no spaces.',
    });
  }

  // ── 2. Email format check ─────────────────────────────────────────────────
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email format.' });
  }

  // ── 3. Password policy ────────────────────────────────────────────────────
  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0) {
    return res.status(400).json({ success: false, message: pwErrors.join(' ') });
  }

  const pool = getPgPool();
  try {
    // ── 4. Duplicate email check ──────────────────────────────────────────
    // COUNT(*) comes back from node-postgres as a string (Postgres COUNT is
    // BIGINT, and pg doesn't parse BIGINT to a JS number by default -- a
    // real value could exceed Number.MAX_SAFE_INTEGER). Number(...) here is
    // always safe: a users-table row count will never approach that limit.
    const dupCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (Number(dupCheck.rows[0].cnt) > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // ── 4.1 Duplicate User ID check ───────────────────────────────────────
    const dupUserCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE LOWER(user_login_id) = $1`,
      [normalizedUserId]
    );
    if (Number(dupUserCheck.rows[0].cnt) > 0) {
      return res.status(409).json({ success: false, message: 'User ID already exists.' });
    }

    // ── 5. Hash the password ──────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // ── 6. Insert into DB ─────────────────────────────────────────────────
    // Oracle needed `RETURNING user_id INTO :out_bind` (a bind variable to
    // receive the value). Postgres's RETURNING is a plain result column --
    // no out-bind machinery needed, the new id just comes back as a normal
    // row. is_active/is_approved are real BOOLEAN columns now (see
    // migration/postgres/schema.sql), not NUMBER(1) 0/1 -- true/false
    // literals, not 1/0.
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, department, is_active, is_approved, user_login_id)
       VALUES ($1, $2, $3, $4, $5, true, false, $6)
       RETURNING user_id`,
      [
        name.trim(),
        email.toLowerCase().trim(),
        hashedPassword,
        role.toLowerCase().trim(),
        department && department.trim() !== '' ? department.trim() : null,
        normalizedUserId,
      ]
    );

    // BIGINT identity columns come back from node-postgres as STRINGS, not
    // numbers (same reasoning as COUNT(*) above -- avoids silent precision
    // loss for values that could exceed Number.MAX_SAFE_INTEGER). Left
    // un-converted, this string would flow into the JWT's `id` claim, and
    // every route comparing req.user.id (from the token) against a
    // parseInt()'d id elsewhere (e.g. routes/quota.js's ownership check)
    // would silently fail with false 403s -- string "5" !== number 5.
    // Number(...) here is safe: user IDs on this app's real scale never
    // approach that limit.
    const newUserId = Number(result.rows[0].user_id);

    const normalizedRole = role.toLowerCase().trim();
    if (normalizedRole === ROLES.DOCTOR || normalizedRole === ROLES.HOD) {
      await pool.query(
        `INSERT INTO user_request_quotas (user_id, quarterly_limit, updated_by)
         VALUES ($1, 10, $2)`,
        [newUserId, newUserId]
      );
    }

    return res.status(201).json({
      success: true,
      pendingApproval: true,
      message: 'Registration submitted successfully. Awaiting admin approval.',
      data: {
        user_id: newUserId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: role.toLowerCase().trim(),
        department: department?.trim() ?? null,
        // Real boolean now, not the Oracle-era literal `1` -- nothing in
        // the frontend checks this specific response field with a strict
        // `=== 1` (checked client/src before converting), so this reflects
        // the real stored value rather than preserving an Oracle-ism.
        is_active: true,
      },
    });

  } catch (err) {
    console.error('[POST /register] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ─── GET /api/users/check-username ───────────────────────────────────────────

// ─── POST /api/login ───────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ success: false, message: 'User ID and password required' });

  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT user_id, password, role, is_approved, force_password_reset FROM users WHERE LOWER(user_login_id) = LOWER($1) AND is_active = true`,
      [userId.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Postgres/node-postgres returns column names lowercase (matching the
    // actual column names) -- Oracle's oracledb returned them UPPERCASE
    // (user.PASSWORD, user.IS_APPROVED, ...). Every property access below
    // had to change case, not just the boolean comparisons.
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Real boolean from Postgres now -- no `!== 1` comparison needed.
    if (!user.is_approved) {
      return res.status(403).json({
        success: false,
        pendingApproval: true,
        message: 'Your account is awaiting approval by the Administrator. Please contact the IT Department.',
      });
    }

    // Same BIGINT-comes-back-as-a-string fix as register's newUserId above
    // -- without this, the JWT's `id` claim would be a string, and every
    // downstream `req.user.id !== someParsedIntId` check would silently
    // 403 a legitimate user. Named dbUserId, not userId -- `userId` above
    // is the login-ID string from req.body; shadowing it with a `const`
    // later in this same function scope would put every earlier
    // reference to it in the temporal dead zone (a real bug hit and fixed
    // while writing this very line).
    const dbUserId = Number(user.user_id);
    const role = normalizeRole(user.role);
    const token = signToken({ id: dbUserId, role, type: 'user' });

    return res.status(200).json({
      success: true,
      user_id: dbUserId,
      role: user.role,
      force_password_reset: user.force_password_reset === true,
      token,
    });
  } catch (err) {
    console.error('[POST /api/login] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

export default router;

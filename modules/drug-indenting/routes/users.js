// User profile/admin-management routes — moved out of server.js
// unchanged, mounted at /api/users. Route order preserved exactly as
// it was (check-username before :id matters — a specific path must be
// registered before a generic single-segment param, or Express would
// wrongly match it as an :id value).
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style conventions used app-wide.
//
// Real, file-specific decision, same as routes/pharmacistDrafts.js:
// GET '/' spreads raw query-result rows directly into its JSON array
// response. Checked client/src/layouts/ProtectedLayout.jsx and found it
// depends on Oracle's original UPPERCASE casing with NO fallback
// (`u.USER_ID === parsedId`, used for session validation on every page
// load) -- so this response keeps the same upperKeys() treatment as
// pharmacistDrafts.js's GET endpoints, not the "safe to modernize"
// treatment auth.js/dashboard.js got. GET /:id's specific consumer
// wasn't found by searching client/src, so its response is preserved
// uppercase too, out of caution rather than assuming it's safe.

import express from 'express';
import bcrypt from 'bcrypt';
import { getPgPool } from '../db/pgPool.js';
import { requireAuth, requireAdminAuth } from '../middleware/requireAuth.js';
import { extractBearerToken, verifyToken, SALT_ROUNDS } from '../utils/auth.js';
import { validatePassword } from '../utils/pureHelpers.js';
import { writeAdminAudit } from '../utils/auditHelpersPg.js';

const router = express.Router();

// Re-uppercases a row's keys (see file header) AND fixes user_id's type:
// it's a BIGINT column, so node-postgres returns it as a string -- same
// bug class as routes/auth.js's dbUserId, just at the response-shaping
// layer instead of the JWT layer. client/src/layouts/ProtectedLayout.jsx
// does `u.USER_ID === parsedId` with no type coercion, so this must come
// back as a real number, not a numeric-looking string.
function upperKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toUpperCase()] = k === 'user_id' ? Number(v) : v;
  }
  return out;
}

router.get('/', requireAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT user_id, name, email, role, department FROM users WHERE is_active = true ORDER BY user_id`
    );
    res.json(result.rows.map(upperKeys));
  } catch (err) {
    console.error('GET users error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  }
});

router.get('/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }
  const pool = getPgPool();
  try {
    const check = await pool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE LOWER(user_login_id) = $1`,
      [username.toLowerCase().trim()]
    );
    return res.json({ available: Number(check.rows[0].cnt) === 0 });
  } catch (err) {
    console.error('[GET /api/users/check-username] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT user_id, user_login_id, name, email, role, department, is_active
       FROM users WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({ success: true, data: upperKeys(result.rows[0]) });
  } catch (err) {
    console.error('[GET /:id] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.put('/:id', async (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const { name, role, department, is_active, user_login_id } = req.body;
  if (!name && !role && department === undefined && is_active === undefined && !user_login_id) {
    return res.status(400).json({ success: false, message: 'Nothing to update.' });
  }

  // role, is_active, and user_login_id are admin-only changes; a plain
  // name/department edit is allowed by the user themselves too.
  const requiresAdmin = role !== undefined || is_active !== undefined || !!user_login_id;

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
  }

  let adminId = null;
  if (decoded.type === 'admin') {
    adminId = decoded.id;
  } else if (decoded.type === 'user') {
    if (requiresAdmin) {
      return res.status(403).json({ success: false, message: 'Only an admin can change role, active status, or user ID.' });
    }
    if (decoded.id !== userId) {
      return res.status(403).json({ success: false, message: 'You can only update your own profile.' });
    }
  } else {
    return res.status(401).json({ success: false, message: 'Invalid token for this request.' });
  }
  req.adminId = adminId;

  const pool = getPgPool();
  try {
    // Check if user exists first to get details for validation and audit logs
    const userCheck = await pool.query(
      `SELECT name, email, user_login_id FROM users WHERE user_id = $1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const currentUser = userCheck.rows[0];
    const oldLoginId = currentUser.user_login_id || '';

    // Build dynamic SET clause with positional binds -- same addParam
    // pattern as routes/dashboard.js, for the same reason (a dynamically
    // built clause needs its placeholder numbers assigned in order).
    const setClauses = [];
    const values = [];
    function addParam(val) {
      values.push(val);
      return `$${values.length}`;
    }

    if (name) { setClauses.push(`name = ${addParam(name.trim())}`); }
    if (role) { setClauses.push(`role = ${addParam(role.trim())}`); }
    if (department !== undefined) {
      setClauses.push(`department = ${addParam(department?.trim() ?? null)}`);
    }
    if (is_active !== undefined) {
      setClauses.push(`is_active = ${addParam(!!is_active)}`);
    }

    let isUserIdChanged = false;
    let normalizedNewId = '';
    if (user_login_id && user_login_id.trim() !== '') {
      normalizedNewId = user_login_id.toLowerCase().trim();
      if (normalizedNewId !== oldLoginId.toLowerCase().trim()) {
        isUserIdChanged = true;
      }
    }

    if (isUserIdChanged) {
      // Admin auth for this change was already verified above (requiresAdmin).

      // 2. Validate regex: ^[a-zA-Z0-9._-]{4,30}$
      const userIdRegex = /^[a-zA-Z0-9._-]{4,30}$/;
      if (!userIdRegex.test(normalizedNewId)) {
        return res.status(400).json({ success: false, message: 'User ID must be 4-30 alphanumeric characters, including underscores, dots, or hyphens, and no spaces.' });
      }

      // 3. Validate uniqueness
      const dupCheck = await pool.query(
        `SELECT COUNT(*) AS cnt FROM users WHERE LOWER(user_login_id) = $1 AND user_id <> $2`,
        [normalizedNewId, userId]
      );
      if (Number(dupCheck.rows[0].cnt) > 0) {
        return res.status(409).json({ success: false, message: 'User ID already exists.' });
      }

      setClauses.push(`user_login_id = ${addParam(normalizedNewId)}`);
    }

    const whereParam = addParam(userId);
    await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE user_id = ${whereParam}`,
      values
    );

    // Write audit log entry if User ID was updated
    if (isUserIdChanged) {
      await writeAdminAudit(
        pool,
        req.adminId,
        'USER_LOGIN_ID_UPDATED',
        userId,
        `Updated User ID for user ${currentUser.name} (${currentUser.email}). Old User ID: ${oldLoginId}, New User ID: ${normalizedNewId}`
      );
    }

    return res.status(200).json({ success: true, message: 'User updated successfully.' });
  } catch (err) {
    console.error('[PUT /:id] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.patch('/:id/change-password', requireAuth, async (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  if (req.user.id !== userId) {
    return res.status(403).json({ success: false, message: 'You can only change your own password.' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required.' });
  }

  const pwErrors = validatePassword(newPassword);
  if (pwErrors.length > 0) {
    return res.status(400).json({ success: false, message: pwErrors.join(' ') });
  }

  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT password FROM users WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hashedNew = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      `UPDATE users SET password = $1 WHERE user_id = $2`,
      [hashedNew, userId]
    );

    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[PATCH /:id/change-password] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.delete('/:id', requireAdminAuth, async (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const pool = getPgPool();
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = false WHERE user_id = $1`,
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({ success: true, message: 'User deactivated successfully.' });
  } catch (err) {
    console.error('[DELETE /:id] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.post('/:id/change-password-force', requireAuth, async (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  if (req.user.id !== userId) {
    return res.status(403).json({ success: false, message: 'You can only change your own password.' });
  }

  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ success: false, message: 'newPassword is required.' });

  const pwErrors = validatePassword(newPassword);
  if (pwErrors.length > 0) return res.status(400).json({ success: false, message: pwErrors.join(' ') });

  const pool = getPgPool();
  try {
    const userCheck = await pool.query(
      `SELECT user_id, force_password_reset FROM users WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found or inactive.' });
    }

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      `UPDATE users
       SET password = $1, force_password_reset = false, temp_password_issued = false
       WHERE user_id = $2`,
      [hashed, userId]
    );
    return res.json({ success: true, message: 'Password updated successfully. You can now proceed.' });
  } catch (err) {
    console.error('[POST /api/users/change-password-force] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});


export default router;

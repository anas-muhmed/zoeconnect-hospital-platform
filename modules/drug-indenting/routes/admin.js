// Admin portal routes — moved out of server.js unchanged, mounted at
// /api/admin. register/login are intentionally public (no token exists
// yet); every other route requires requireAdminAuth.
//
// CONVERTED to Postgres (migration/oracle-to-postgres). See
// routes/auth.js's header for the bind-style conventions used app-wide.
//
// Real, file-specific decisions:
//
// 1. GET /users and GET /audit-logs spread/build responses the frontend
//    genuinely depends on in specific ways -- checked
//    client/src/components/AdminDashboard.js directly:
//    - GET /users: hand-builds its response object (already lowercase
//      keys, unlike pharmacistDrafts.js/users.js's raw row spreads), but
//      AdminDashboard.js does `user.is_active === 1` and
//      `user.force_password_reset === 1` with STRICT equality, no
//      fallback, no truthiness check. Real BOOLEAN true/false from
//      Postgres would make every one of those checks silently false
//      forever. So these three fields are deliberately converted back to
//      numeric 1/0 in this response, not left as real booleans --
//      preserving the exact wire contract the frontend already depends
//      on, not "modernizing" it.
//    - GET /audit-logs: spreads raw rows directly, and AdminDashboard.js
//      reads `log.AUDIT_ID`, `log.ACTION`, `log.TARGET_USER_NAME`, etc.
//      with no fallback -- same upperKeys() treatment as
//      pharmacistDrafts.js/users.js's GET endpoints.
//
// 2. toggle-user's own JSON response field `is_active` is the same
//    numeric-1/0 contract as GET /users, for consistency, even though
//    checking the frontend found it isn't actually read from THIS
//    specific response (only from the next GET /users refetch) --
//    kept honest/consistent rather than silently drifting the two
//    endpoints' representations of the same concept apart.

import express from 'express';
import bcrypt from 'bcrypt';
import { getPgPool } from '../db/pgPool.js';
import { requireAdminAuth } from '../middleware/requireAuth.js';
import { signToken, SALT_ROUNDS } from '../utils/auth.js';
import { validatePassword } from '../utils/pureHelpers.js';
import { writeAdminAudit } from '../utils/auditHelpersPg.js';
import { ROLES } from '../utils/workflow.js';

const router = express.Router();

// Re-uppercases a row's keys, converting BIGINT id-shaped fields to real
// numbers along the way (see routes/users.js's upperKeys for the same
// pattern and reasoning).
function upperKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const isIdField = k === 'audit_id' || k === 'target_user' || k === 'admin_id';
    out[k.toUpperCase()] = isIdField && v !== null ? Number(v) : v;
  }
  return out;
}

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email, and password are required.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email format.' });
  }
  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0) {
    return res.status(400).json({ success: false, message: pwErrors.join(' ') });
  }

  const pool = getPgPool();
  try {
    // ONE-TIME: check if admin already exists
    const existCheck = await pool.query(`SELECT COUNT(*) AS cnt FROM admin_users`);
    if (Number(existCheck.rows[0].cnt) > 0) {
      return res.status(409).json({
        success: false,
        message: 'Admin account already exists. Registration is one-time only.',
      });
    }

    const hashedPw = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO admin_users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING admin_id`,
      [name.trim(), email.toLowerCase().trim(), hashedPw]
    );
    const adminId = Number(result.rows[0].admin_id);
    console.log(`[ADMIN] Admin account created: ${email} (admin_id=${adminId})`);
    return res.status(201).json({
      success: true,
      message: 'Admin account created successfully.',
      admin_id: adminId,
    });
  } catch (err) {
    console.error('[POST /api/admin/register] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// POST /api/admin/login — Admin login
// =============================================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required.' });
  }
  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT admin_id, name, email, password FROM admin_users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
    const adminId = Number(admin.admin_id);
    const token = signToken({ id: adminId, role: 'admin', type: 'admin' });

    return res.status(200).json({
      success: true,
      admin_id: adminId,
      name: admin.name,
      email: admin.email,
      role: 'admin',
      token,
    });
  } catch (err) {
    console.error('[POST /api/admin/login] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// GET /api/admin/users — Get all users grouped by role
// =============================================================
router.get('/users', requireAdminAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT user_id,
          user_login_id,
          name,
          email,
          role,
          department,
          is_active,
          force_password_reset,
          temp_password_issued
   FROM users
   ORDER BY role, name`
    );
    // Group by role
    const grouped = {};
    for (const row of result.rows) {
      const r = row.role || 'unknown';
      if (!grouped[r]) grouped[r] = [];
      grouped[r].push({
        user_id: Number(row.user_id),
        user_login_id: row.user_login_id,
        name: row.name,
        email: row.email,
        role: row.role,
        department: row.department,
        // Real BOOLEAN from Postgres, converted back to 1/0 -- see file
        // header. AdminDashboard.js's `=== 1` checks depend on this.
        is_active: row.is_active ? 1 : 0,
        force_password_reset: row.force_password_reset ? 1 : 0,
        temp_password_issued: row.temp_password_issued ? 1 : 0,
      });
    }
    return res.json({ success: true, data: grouped, total: result.rows.length });
  } catch (err) {
    console.error('[GET /api/admin/users] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// PUT /api/admin/reset-password/:userId — Admin resets a user's password
// Generates a secure temp password, hashes it, sets force_password_reset=true
// NEVER returns hashed password. Returns temp password ONCE for admin to relay.
// =============================================================
router.put('/reset-password/:userId', requireAdminAuth, async (req, res) => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const pool = getPgPool();
  try {
    // Check user exists
    const userCheck = await pool.query(
      `SELECT user_id, name, email, role FROM users WHERE user_id = $1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = userCheck.rows[0];

    // Generate secure temp password: TempXXXX@YY format
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    const tempPassword = `Temp${randomNum}@${randomSuffix}`;

    const hashedTemp = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    await pool.query(
      `UPDATE users
       SET password = $1,
           force_password_reset = true,
           temp_password_issued = true
       WHERE user_id = $2`,
      [hashedTemp, userId]
    );

    await writeAdminAudit(pool, req.adminId, 'PASSWORD_RESET', userId,
      `Admin reset password for user: ${user.name} (${user.email}) [Role: ${user.role}]`);

    // Return temp password ONCE — admin conveys it securely to user
    return res.json({
      success: true,
      message: `Temporary password set for ${user.name}. User must change on next login.`,
      temp_password: tempPassword,
    });
  } catch (err) {
    console.error('[PUT /api/admin/reset-password] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// PUT /api/admin/toggle-user/:userId — Activate or deactivate a user
// =============================================================
router.put('/toggle-user/:userId', requireAdminAuth, async (req, res) => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const pool = getPgPool();
  try {
    const userCheck = await pool.query(
      `SELECT user_id, name, email, role, is_active FROM users WHERE user_id = $1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = userCheck.rows[0];
    // user.is_active is a real boolean from pg now (was 1/0 from Oracle).
    const newActive = !user.is_active;

    await pool.query(
      `UPDATE users SET is_active = $1 WHERE user_id = $2`,
      [newActive, userId]
    );

    // newStatus kept as numeric 1/0 for the JSON response -- see file
    // header on why (consistency with GET /users's wire contract).
    const newStatus = newActive ? 1 : 0;
    const action = newActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
    await writeAdminAudit(pool, req.adminId, action, userId,
      `${newActive ? 'Activated' : 'Deactivated'} user: ${user.name} (${user.email}) [Role: ${user.role}]`);

    return res.json({
      success: true,
      message: `User ${user.name} has been ${newActive ? 'activated' : 'deactivated'}.`,
      is_active: newStatus,
    });
  } catch (err) {
    console.error('[PUT /api/admin/toggle-user] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// GET /api/admin/audit-logs — View admin action history
// =============================================================
router.get('/audit-logs', requireAdminAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT al.audit_id, al.action, al.target_user, al.details, al.performed_at,
              u.name AS target_user_name, u.email AS target_user_email
       FROM admin_audit_logs al
       LEFT JOIN users u ON u.user_id = al.target_user
       WHERE al.admin_id = $1
       ORDER BY al.performed_at DESC
       FETCH FIRST 200 ROWS ONLY`,
      [req.adminId]
    );
    return res.json({ success: true, data: result.rows.map(upperKeys) });
  } catch (err) {
    console.error('[GET /api/admin/audit-logs] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// GET /api/admin/pending-users — Get all users awaiting approval
// =============================================================
router.get('/pending-users', requireAdminAuth, async (req, res) => {
  const pool = getPgPool();
  try {
    const result = await pool.query(
      `SELECT user_id, user_login_id, name, email, role, department
       FROM users
       WHERE is_approved = false AND is_active = true
       ORDER BY user_id DESC`
    );
    const users = result.rows.map(row => ({
      user_id: Number(row.user_id),
      user_login_id: row.user_login_id,
      name: row.name,
      email: row.email,
      role: row.role,
      department: row.department
    }));
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error('[GET /api/admin/pending-users] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// PUT /api/admin/approve-user/:userId — Approve a pending registration
// =============================================================
router.put('/approve-user/:userId', requireAdminAuth, async (req, res) => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const pool = getPgPool();
  try {
    const userCheck = await pool.query(
      `SELECT user_id, name, email, role FROM users WHERE user_id = $1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = userCheck.rows[0];

    await pool.query(
      `UPDATE users SET is_approved = true WHERE user_id = $1`,
      [userId]
    );

    await writeAdminAudit(pool, req.adminId, 'USER_APPROVED', userId,
      `Approved user registration: ${user.name} (${user.email}) [Role: ${user.role}]`);

    return res.json({
      success: true,
      message: `User ${user.name} has been approved.`,
    });
  } catch (err) {
    console.error('[PUT /api/admin/approve-user] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// PUT /api/admin/users/:userId/role — Update a user's role
// =============================================================
router.put('/users/:userId/role', requireAdminAuth, async (req, res) => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, message: 'Invalid user ID.' });
  }

  let { role } = req.body;
  if (typeof role !== 'string') {
    return res.status(400).json({ success: false, message: 'Role must be a string.' });
  }

  role = role.trim();
  const normalizedRole = role.toLowerCase();
  const ALLOWED_ROLES = [ROLES.DOCTOR, ROLES.HOD, ROLES.PHARMACIST, ROLES.PHARMACY_HEAD, ROLES.CEO];
  if (!ALLOWED_ROLES.includes(normalizedRole)) {
    return res.status(400).json({ success: false, message: 'Invalid role value.' });
  }

  function formatRole(r) {
    const l = (r || '').toLowerCase().trim();
    if (l === ROLES.HOD) return 'HOD';
    if (l === ROLES.CEO) return 'CEO';
    if (l === ROLES.PHARMACY_HEAD) return 'PharmacyHead';
    return l.charAt(0).toUpperCase() + l.slice(1);
  }

  const pool = getPgPool();
  try {
    const userCheck = await pool.query(
      `SELECT user_id, name, email, role FROM users WHERE user_id = $1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = userCheck.rows[0];
    const oldRole = user.role || '';

    await pool.query(
      `UPDATE users SET role = $1 WHERE user_id = $2`,
      [normalizedRole, userId]
    );

    // Write audit log entry
    await writeAdminAudit(
      pool,
      req.adminId,
      'ROLE_UPDATED',
      userId,
      `Updated role for user ${user.name} (${user.email}). Old Role: ${formatRole(oldRole)}, New Role: ${formatRole(normalizedRole)}`
    );

    return res.json({
      success: true,
      message: 'Role updated successfully.',
      role: formatRole(normalizedRole)
    });
  } catch (err) {
    console.error('[PUT /api/admin/users/:userId/role] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// =============================================================
// PUT /api/admin/reject-user/:userId — Reject a pending registration (deactivate)
// =============================================================
router.put('/reject-user/:userId', requireAdminAuth, async (req, res) => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const pool = getPgPool();
  try {
    const userCheck = await pool.query(
      `SELECT user_id, name, email, role FROM users WHERE user_id = $1`,
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = userCheck.rows[0];

    await pool.query(
      `UPDATE users SET is_active = false, is_approved = false WHERE user_id = $1`,
      [userId]
    );

    await writeAdminAudit(pool, req.adminId, 'USER_REJECTED', userId,
      `Rejected user registration and deactivated account: ${user.name} (${user.email}) [Role: ${user.role}]`);

    return res.json({
      success: true,
      message: `User registration for ${user.name} has been rejected/deactivated.`,
    });
  } catch (err) {
    console.error('[PUT /api/admin/reject-user] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

export default router;

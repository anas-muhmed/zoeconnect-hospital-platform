import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { pool, queryOne, runQuery, queryAll, hospitalClause } from '../config/db.js';
import { signToken } from '../middleware/auth.js';

const ALLOWED_DEPARTMENTS = ['House Keeping', 'M Staff'];

// ── Password Reset Request ─────────────────────────────────────────────────────

export async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.trim())
      return res.status(400).json({ message: 'Email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return res.status(400).json({ message: 'Invalid email format.' });

    const cleanEmail = email.trim().toLowerCase();

    const user = await queryOne(
      'SELECT id, full_name, employee_id FROM users WHERE email = $1',
      [cleanEmail]
    );

    if (!user) {
      return res.status(404).json({ message: 'No account found with this email.' });
    }

    await runQuery(
      'UPDATE users SET password_reset_requested = TRUE, updated_at = NOW() WHERE email = $1',
      [cleanEmail]
    );

    res.status(200).json({ message: 'Password reset request submitted. Contact admin for assistance.' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
}

// ── Admin: Get Password Reset Requests ─────────────────────────────────────────

export async function getPasswordResetRequests(req, res) {
  try {
    const hc = hospitalClause(req.hospitalId, 1);
    const requests = await queryAll(
      `SELECT id, full_name, employee_id, email, department, phone1, password_reset_requested, must_change_password
       FROM users
       WHERE password_reset_requested = TRUE${hc.sql}
       ORDER BY updated_at DESC`,
      hc.params
    );
    res.json(requests);
  } catch (error) {
    console.error('Get password reset requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// ── Admin: Reset User Password ────────────────────────────────────────────────

export async function resetUserPassword(req, res) {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Invalid request. Password must be at least 8 characters.' });
    }

    const hc = hospitalClause(req.hospitalId, 2);
    const user = await queryOne(`SELECT id FROM users WHERE id = $1${hc.sql}`, [userId, ...hc.params]);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await runQuery(
      `UPDATE users 
       SET password = $1, password_reset_requested = FALSE, must_change_password = TRUE, updated_at = NOW() 
       WHERE id = $2`,
      [hash, userId]
    );

    res.status(200).json({ message: 'Password reset successfully. User must change password on next login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
}

// ── User: Change Password (when must_change_password is true) ──────────────────

export async function changePassword(req, res) {
  try {
    const { newPassword } = req.body;
    const userId = req.user.id;
    // Same endpoint serves both account types - Staff/Housekeeping live in
    // `users`, Admin/SuperAdmin live in `admin`. Table + column names differ
    // slightly (updated_at vs "updatedAt"), so branch once here rather than
    // duplicating this whole handler for a second table.
    const isAdminAccount = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';
    const table = isAdminAccount ? 'admin' : 'users';
    const updatedAtColumn = isAdminAccount ? '"updatedAt"' : 'updated_at';

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Invalid request. Password must be at least 8 characters.' });
    }

    // No currentPassword check here, deliberately - this endpoint is only
    // ever reached via the forced must-change-password redirect, seconds
    // after the caller already proved they know the password by logging in
    // with it. It's never exposed as a general "change my password"
    // settings page, so re-verifying it again here would be redundant, not
    // a real extra security barrier. authenticate() has already confirmed
    // who this is via a valid session.
    const user = await queryOne(`SELECT id FROM ${table} WHERE id = $1`, [userId]);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await runQuery(
      `UPDATE ${table}
       SET password = $1, must_change_password = FALSE, ${updatedAtColumn} = NOW()
       WHERE id = $2`,
      [hash, userId]
    );

    res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
}

// ── Voluntary password reset (already logged in normally, from Settings) ───────
// Unlike changePassword above, this one DOES require the current password -
// it's reachable any time from an already-active session (not gated behind
// must_change_password), so skipping that check here really would be a real
// security gap: anyone who got hold of an unlocked session/cookie could
// silently lock the real owner out. Same table-generalization as
// changePassword, kept separate rather than merging the two - they answer
// genuinely different questions ("prove you still know this account's
// password" vs "you already just proved that at login a second ago").
export async function resetOwnPassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    const isAdminAccount = req.user.role === 'Admin' || req.user.role === 'SuperAdmin';
    const table = isAdminAccount ? 'admin' : 'users';
    const updatedAtColumn = isAdminAccount ? '"updatedAt"' : 'updated_at';

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Invalid request. Password must be at least 8 characters.' });
    }

    const user = await queryOne(`SELECT password FROM ${table} WHERE id = $1`, [userId]);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      // 403, not 401: a wrong current password is a business-logic rejection,
      // not an expired/invalid session token. The global axios interceptor in
      // main.jsx treats any 401 as "session expired" and force-logs the user
      // out — using 401 here would kick an admin out of their own session
      // just for mistyping their current password.
      return res.status(403).json({ message: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await runQuery(
      `UPDATE ${table}
       SET password = $1, ${updatedAtColumn} = NOW()
       WHERE id = $2`,
      [hash, userId]
    );

    res.status(200).json({ message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Reset own password error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
}

// ── User registration ────────────────────────────────────────────────────────

export async function registerUser(req, res) {
  try {
    const { fullname, employee_id, department, phone1, phone2, email, password, client_id } = req.body;

    if (!fullname || typeof fullname !== 'string' || !fullname.trim())
      return res.status(400).json({ message: 'Full name is required.' });
    if (!employee_id || typeof employee_id !== 'string' || !employee_id.trim())
      return res.status(400).json({ message: 'Employee ID is required.' });
    if (!/^[A-Za-z0-9]+$/.test(employee_id.trim()))
      return res.status(400).json({ message: 'Employee ID must be alphanumeric.' });
    if (!department || !ALLOWED_DEPARTMENTS.includes(department))
      return res.status(400).json({ message: 'Invalid department selected.' });
    if (!phone1 || !/^[6-9]\d{9}$/.test(phone1.trim()))
      return res.status(400).json({ message: 'Valid 10-digit phone number required.' });
    if (phone2 && phone2.trim() && !/^[6-9]\d{9}$/.test(phone2.trim()))
      return res.status(400).json({ message: 'Secondary phone number is invalid.' });
    if (!email || typeof email !== 'string' || !email.trim())
      return res.status(400).json({ message: 'Email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return res.status(400).json({ message: 'Invalid email format.' });
    if (!password || password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (!client_id || typeof client_id !== 'string' || !client_id.trim())
      return res.status(400).json({ message: 'Client ID is required.' });

    const cleanEmployeeId = employee_id.trim();
    const cleanEmail      = email.trim().toLowerCase();
    const cleanFullname   = fullname.trim();
    const cleanPhone1     = phone1.trim();
    const cleanPhone2     = phone2 ? phone2.trim() : null;
    const cleanClientId   = client_id.trim().toUpperCase();

    // The Client ID tells us which hospital this new staff member belongs to
    // - this is the real fix for a gap noted since Phase 2: registration
    // previously had no way to attach a new user to the correct hospital.
    const hospital = await queryOne('SELECT id FROM hospitals WHERE client_id = $1 AND is_active = true', [cleanClientId]);
    if (!hospital) return res.status(400).json({ message: 'Invalid Client ID.' });

    // Case-insensitive, matching loginUser's lookup - otherwise "EMP1" could
    // be registered as a second, distinct account even though "emp1" already
    // exists, and login-by-employee_id would then be ambiguous between them.
    const existingByEmpId = await queryOne('SELECT id FROM users WHERE employee_id ILIKE $1', [cleanEmployeeId]);
    if (existingByEmpId) return res.status(400).json({ message: 'Employee ID is already registered.' });

    const existingByEmail = await queryOne('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existingByEmail) return res.status(400).json({ message: 'Email address is already registered.' });

    const hash = await bcrypt.hash(password, 12);
    await runQuery(
      `INSERT INTO users (full_name, employee_id, department, phone1, phone2, email, password, approval_status, hospital_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
      [cleanFullname, cleanEmployeeId, department, cleanPhone1, cleanPhone2, cleanEmail, hash, hospital.id]
    );

    res.status(201).json({ message: 'Registration submitted. Awaiting admin approval.' });
  } catch (error) {
    console.error('Registration error:', error.code || error.message);
    if (error.code === '23505') { // PG unique violation
      return res.status(400).json({ message: 'Employee ID or email already registered.' });
    }
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
}

// ── User login ───────────────────────────────────────────────────────────────

export async function loginUser(req, res) {
  try {
    let { employeeId, password } = req.body;

    if (!employeeId || !password)
      return res.status(400).json({ message: 'Employee ID and password are required.' });

    employeeId = String(employeeId).trim();
    if (!/^[A-Za-z0-9]+$/.test(employeeId))
      return res.status(401).json({ message: 'Invalid credentials.' });

    // Case-insensitive: the login form uppercases what you type, but existing
    // accounts (and anything registered without that transform) may have a
    // lowercase/mixed-case employee_id stored - a case-sensitive match here
    // would reject the exact right employee_id/password over letter casing.
    const user = await queryOne('SELECT * FROM users WHERE employee_id ILIKE $1', [employeeId]);
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials.' });

    const status = user.approval_status || 'approved';
    if (status === 'pending') {
      return res.status(403).json({ message: 'Your registration is pending admin approval. Please contact the admin.' });
    }
    if (status === 'rejected') {
      return res.status(403).json({ message: 'Your registration has been rejected. Please contact the admin for further assistance.' });
    }

    const mustChange = !!user.must_change_password;
    // Baked into the token itself, not just checked here, so the auth
    // middleware can enforce "nothing but change-password" on every
    // subsequent request without an extra DB lookup per request. Safe to
    // rely on a token issued at this exact moment - the change-password
    // flow always forces a fresh login afterward, so there's no scenario
    // where this flag needs to flip mid-session on the same token.
    const token = signToken({ id: user.id, role: user.department, hospitalId: user.hospital_id, mustChangePassword: mustChange });

    res.cookie('token', token, {
      httpOnly: true,
      // Secure must reflect the actual connection, not just NODE_ENV --
      // this app currently runs production mode over plain HTTP on the
      // LAN, and a Secure cookie is silently dropped by the browser on a
      // non-HTTPS connection, breaking auth entirely right after login.
      // req.secure honors X-Forwarded-Proto via the trust proxy setting
      // in server.js, so this still locks the cookie down once actually
      // served over HTTPS.
      secure: req.secure,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    return res.status(200).json({
      message: 'Login successful',
      mustChangePassword: mustChange,
      user: { id: user.id, fullname: user.full_name, email: user.email, role: user.department }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
}

// ── Admin login ──────────────────────────────────────────────────────────────

export async function loginAdmin(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password required' });

    const user = await queryOne('SELECT * FROM admin WHERE username = $1', [username]);
    if (!user) return res.status(401).json({ message: 'Invalid username' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid password' });

    const mustChange = !!user.must_change_password;
    const token = signToken({ id: user.id, role: user.role, hospitalId: user.hospital_id, mustChangePassword: mustChange });

    res.cookie('token', token, {
      httpOnly: true,
      // Secure must reflect the actual connection, not just NODE_ENV --
      // this app currently runs production mode over plain HTTP on the
      // LAN, and a Secure cookie is silently dropped by the browser on a
      // non-HTTPS connection, breaking auth entirely right after login.
      // req.secure honors X-Forwarded-Proto via the trust proxy setting
      // in server.js, so this still locks the cookie down once actually
      // served over HTTPS.
      secure: req.secure,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      mustChangePassword: mustChange,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}

// ── SuperAdmin login ───────────────────────────────────────────────────────────

const SUPERADMIN_CREDENTIALS = {
  username: 'superadmin',
  password: 'superadmin123'
};

export async function loginSuperAdmin(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password required' });

    if (username !== SUPERADMIN_CREDENTIALS.username || password !== SUPERADMIN_CREDENTIALS.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // hospitalId: null - SuperAdmin isn't scoped to one hospital, sees/manages all
    const token = signToken({ id: 'superadmin', role: 'SuperAdmin', hospitalId: null });

    res.cookie('token', token, {
      httpOnly: true,
      // Secure must reflect the actual connection, not just NODE_ENV --
      // this app currently runs production mode over plain HTTP on the
      // LAN, and a Secure cookie is silently dropped by the browser on a
      // non-HTTPS connection, breaking auth entirely right after login.
      // req.secure honors X-Forwarded-Proto via the trust proxy setting
      // in server.js, so this still locks the cookie down once actually
      // served over HTTPS.
      secure: req.secure,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      user: { id: 'superadmin', username: SUPERADMIN_CREDENTIALS.username, role: 'SuperAdmin' }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────────

export async function logout(req, res) {
  try {
    res.clearCookie('token');
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
}

// ── Add co-admin (an existing Admin adding another admin to their own
// hospital) ───────────────────────────────────────────────────────────────
// Replaces the old public, unauthenticated /admin/register - that endpoint
// took no hospital_id at all, so every admin it created silently fell back
// to the `admin` table's temporary DEFAULT hospital_id (whichever hospital
// was created first), attaching new admins to the wrong hospital. It was
// also reachable with no login at all via a public /admin-register page,
// letting anyone create a real Admin account. A hospital's first Admin is
// still created correctly during SuperAdmin's hospital onboarding
// (hospitalController.js createHospital, which does pass hospital_id) -
// this endpoint is only for that hospital's own Admin adding a second one,
// scoped from their own authenticated session, not a client-supplied value.
export async function addCoAdmin(req, res) {
  try {
    const { username, email, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password are required' });
    if (password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const existing = await queryOne('SELECT id FROM admin WHERE username = $1', [username]);
    if (existing) return res.status(400).json({ message: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 12);
    // Same reasoning as the SuperAdmin->Admin temp password: the inviting
    // Admin shouldn't permanently know the co-admin's real password either.
    await runQuery(
      'INSERT INTO admin (id, username, email, password, hospital_id, must_change_password) VALUES ($1, $2, $3, $4, $5, true)',
      [uuidv4(), username, email || null, hashedPassword, req.hospitalId]
    );

    res.json({ message: 'Co-admin added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}

// ── List admins (SuperAdmin only) ────────────────────────────────────────────

export async function listAdmins(req, res) {
  try {
    const hc = hospitalClause(req.hospitalId, 1);
    const admins = await queryAll(
      `SELECT id, username, email, role, status, "createdAt" FROM admin WHERE 1=1${hc.sql} ORDER BY "createdAt" DESC`,
      hc.params
    );
    res.json(admins);
  } catch (error) {
    console.error('List admins error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
}

// ── Delete admin (SuperAdmin only) ────────────────────────────────────────────

export async function deleteAdmin(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Admin ID required' });

    const hc = hospitalClause(req.hospitalId, 2);
    const admin = await queryOne(`SELECT * FROM admin WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    if (admin.role === 'SuperAdmin') {
      return res.status(403).json({ message: 'Cannot delete SuperAdmin' });
    }

    await runQuery('DELETE FROM admin WHERE id = $1', [id]);
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
}

// ── Admin user management ────────────────────────────────────────────────────

export async function listUsers(req, res) {
  try {
    // PostgreSQL CASE replaces MySQL FIELD() for ordering
    const hc = hospitalClause(req.hospitalId, 1);
    const users = await queryAll(
      `SELECT id, full_name, employee_id, department, phone1, phone2, email,
              approval_status, admin_remarks, created_at,
              password_reset_requested
       FROM users
       WHERE 1=1${hc.sql}
       ORDER BY
         CASE approval_status
           WHEN 'pending'  THEN 1
           WHEN 'approved' THEN 2
           WHEN 'rejected' THEN 3
           ELSE 4
         END,
         created_at DESC`,
      hc.params
    );
    res.json(users);
  } catch (error) {
    console.error('Admin users list error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
}

export async function getUserById(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^\d+$/.test(id))
      return res.status(400).json({ message: 'Invalid user ID.' });

    const hc = hospitalClause(req.hospitalId, 2);
    const user = await queryOne(
      `SELECT id, full_name, employee_id, department, phone1, phone2, email,
              approval_status, admin_remarks, created_at, updated_at,
              must_change_password, password_reset_requested
       FROM users WHERE id = $1${hc.sql}`,
      [id, ...hc.params]
    );
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (error) {
    console.error('Admin user detail error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
}

export async function approveUser(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^\d+$/.test(id))
      return res.status(400).json({ message: 'Invalid user ID.' });

    const hc = hospitalClause(req.hospitalId, 2);
    const user = await queryOne(`SELECT id FROM users WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    await runQuery(
      "UPDATE users SET approval_status = 'approved', admin_remarks = NULL, updated_at = NOW() WHERE id = $1",
      [id]
    );
    res.json({ message: 'User approved successfully.' });
  } catch (error) {
    console.error('Approve error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
}

export async function rejectUser(req, res) {
  try {
    const { id } = req.params;
    if (!id || !/^\d+$/.test(id))
      return res.status(400).json({ message: 'Invalid user ID.' });

    const remarks = req.body.remarks ? String(req.body.remarks).substring(0, 500) : null;
    const hc = hospitalClause(req.hospitalId, 2);
    const user = await queryOne(`SELECT id FROM users WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    await runQuery(
      "UPDATE users SET approval_status = 'rejected', admin_remarks = $1, updated_at = NOW() WHERE id = $2",
      [remarks, id]
    );
    res.json({ message: 'User rejected.' });
  } catch (error) {
    console.error('Reject error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
}

// ── Password Reset Flow ──────────────────────────────────────────────────────

// Admin manually resets a user's password
export async function adminResetPassword(req, res) {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!id || !/^\d+$/.test(id))
      return res.status(400).json({ message: 'Invalid user ID.' });
    if (!password || password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const hc = hospitalClause(req.hospitalId, 2);
    const user = await queryOne(`SELECT id FROM users WHERE id = $1${hc.sql}`, [id, ...hc.params]);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const hash = await bcrypt.hash(password, 12);
    await runQuery(
      `UPDATE users SET password = $1, must_change_password = TRUE, password_reset_requested = FALSE WHERE id = $2`,
      [hash, id]
    );
    res.json({ message: 'Password has been reset. User must change it on next login.' });
  } catch (error) {
    console.error('Admin password reset error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
}
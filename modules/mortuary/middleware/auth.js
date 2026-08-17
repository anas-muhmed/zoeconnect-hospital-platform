import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '8h';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// Verifies the Bearer token or cookie and attaches { id, role, hospitalId } to req.user.
// Rejects with 401 if missing or invalid — this is the real check that
// replaces trusting a client-supplied x-admin-role/x-user-role header.
//
// req.hospitalId is also set directly (same value as req.user.hospitalId) so
// controllers can scope queries without reaching into req.user each time.
// It is null for SuperAdmin, who isn't scoped to a single hospital — query
// helpers should treat null as "no hospital filter" (sees/manages all).
export function authenticate(req, res, next) {
  // Try to get token from Authorization header first (for backward compatibility)
  const header = req.headers['authorization'] || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : null;

  // If not in header, try to get from cookie
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    req.hospitalId = req.user.hospitalId ?? null;

    // A temporary password (set by SuperAdmin at onboarding, or by an Admin
    // inviting a co-admin) must be changed before the account can do
    // anything else - otherwise this is purely a client-side redirect that
    // a direct API call could just ignore. mustChangePassword is baked into
    // the token at login (see loginUser/loginAdmin), so this needs no extra
    // DB lookup per request.
    // This router is mounted at /api/mortuary (see server.js), so these
    // must match the real request path -- a bare /api/change_password
    // here never matches /api/mortuary/change_password, which meant a
    // user forced to change their password (must_change_password = TRUE)
    // got 403'd on every request, including the one meant to let them
    // set a new password. Total lockout, no way out.
    const ALLOWED_WHILE_MUST_CHANGE = [
      '/api/mortuary/change_password',
      '/api/mortuary/logout',
      '/api/mortuary/admin/logout',
      '/api/mortuary/superadmin/logout',
    ];
    const cleanPath = req.originalUrl.split('?')[0];
    if (req.user.mustChangePassword && !ALLOWED_WHILE_MUST_CHANGE.includes(cleanPath)) {
      return res.status(403).json({
        message: 'You must change your password before continuing.',
        mustChangePassword: true,
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
}

// Use after authenticate. Rejects with 403 if req.user.role isn't in allowedRoles.
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action' });
    }
    next();
  };
}

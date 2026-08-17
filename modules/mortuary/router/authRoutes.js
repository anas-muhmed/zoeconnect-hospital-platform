import { Router } from 'express';
import {
  registerUser,
  loginUser,
  loginAdmin,
  loginSuperAdmin,
  addCoAdmin,
  listAdmins,
  deleteAdmin,
  listUsers,
  getUserById,
  approveUser,
  rejectUser,
  requestPasswordReset,
  getPasswordResetRequests,
  resetUserPassword,
  adminResetPassword,
  changePassword,
  resetOwnPassword,
  logout
} from '../controller/authController.js';

import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// User auth
router.post('/user_register', registerUser);
router.post('/login',         loginUser);
router.post('/logout',        logout);
router.post('/forgot_password', requestPasswordReset);
router.post('/change_password', authenticate, changePassword);

// Voluntary password reset from an already-active session (e.g. Settings /
// sidebar) - requires the current password, unlike change_password above
// which only ever runs immediately after a forced-temp-password login.
router.post('/reset_own_password', authenticate, resetOwnPassword);

// Admin auth
router.post('/admin/login',    loginAdmin);
router.post('/admin/logout',   logout);

// An existing Admin adding another admin to their own hospital - hospital_id
// comes from the authenticated Admin's own token, never from the request
// body, so there's no way to target another hospital.
router.post('/admin/co-admin', authenticate, authorize('Admin'), addCoAdmin);

// SuperAdmin auth
router.post('/superadmin/login', loginSuperAdmin);
router.post('/superadmin/logout', logout);

// SuperAdmin admin management
router.get('/admin/list',    authenticate, authorize('SuperAdmin'), listAdmins);
router.delete('/admin/:id',  authenticate, authorize('SuperAdmin'), deleteAdmin);

// Admin user management
router.get('/admin/users',              authenticate, authorize('Admin', 'SuperAdmin'), listUsers);
router.get('/admin/users/:id',          authenticate, authorize('Admin', 'SuperAdmin'), getUserById);
router.post('/admin/users/:id/approve', authenticate, authorize('Admin', 'SuperAdmin'), approveUser);
router.post('/admin/users/:id/reject',    authenticate, authorize('Admin', 'SuperAdmin'), rejectUser);

// Password reset management
router.get('/admin/password-requests', authenticate, authorize('Admin', 'SuperAdmin'), getPasswordResetRequests);

// Match frontend call: POST /admin/users/:id/reset_password
router.post('/admin/users/:id/reset_password', authenticate, authorize('Admin', 'SuperAdmin'), adminResetPassword);

// Existing endpoint (alternate flow)
router.post('/admin/reset-password', authenticate, authorize('Admin', 'SuperAdmin'), resetUserPassword);

export default router;
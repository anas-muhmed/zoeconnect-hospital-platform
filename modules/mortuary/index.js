// Mortuary module — API router
// Mounted at /api/mortuary in the unified server.
// Routes here have no /api prefix — the mount point provides it.

import express from 'express';
import cookieParser from 'cookie-parser';

import cabinRoutes           from './router/cabinRoutes.js';
import bodyRoutes            from './router/bodyRoutes.js';
import allocationRoutes      from './router/allocationRoutes.js';
import billingRoutes         from './router/billingRoutes.js';
import serviceBillingRoutes  from './router/serviceBillingRoutes.js';
import releaseRoutes         from './router/releaseRoutes.js';
import releaseHistoryRoutes  from './router/releaseHistoryRoutes.js';
import housekeepingRoutes    from './router/housekeepingRoutes.js';
import reportsRoutes         from './router/reportsRoutes.js';
import serviceRoutes         from './router/serviceRoutes.js';
import settingsRoutes        from './router/settingsRoutes.js';
import authRoutes            from './router/authRoutes.js';
import uploadRoutes          from './router/uploadRoutes.js';
import hospitalRoutes        from './router/hospitalRoutes.js';
import { getDashboardStats } from './controller/dashboardController.js';
import { getHospitalByClientId, getHospitalByEmployeeId, getHospitalByAdminUsername } from './controller/hospitalController.js';
import { authenticate, authorize } from './middleware/auth.js';

const router = express.Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');

// Mortuary auth reads both Bearer tokens and cookies
router.use(cookieParser());

router.use('/cabins',              cabinRoutes);
router.use('/bodies',              bodyRoutes);
router.use('/cabin-allocations',   allocationRoutes);
router.use('/billing',             billingRoutes);
router.use('/service-billing',     serviceBillingRoutes);
router.use('/body-releases',       releaseRoutes);
router.use('/release-history',     releaseHistoryRoutes);
router.use('/housekeeping',        housekeepingRoutes);
router.use('/reports',             reportsRoutes);
router.use('/services',            serviceRoutes);
router.use('/billing-settings',    settingsRoutes);
router.use('/upload',              uploadRoutes);
router.use('/uploads',             uploadRoutes);
router.use('/superadmin/hospitals', hospitalRoutes);

// Public hospital lookup (shown on login page before auth)
router.get('/hospitals/by-client-id/:clientId',      getHospitalByClientId);
router.get('/hospitals/by-employee-id/:employeeId',  getHospitalByEmployeeId);
router.get('/hospitals/by-admin-username/:username', getHospitalByAdminUsername);

router.get('/dashboard/stats', authenticate, STAFF, getDashboardStats);

// authRoutes registers /login, /register, /admin/login etc. at its own paths
router.use('/', authRoutes);

export default router;

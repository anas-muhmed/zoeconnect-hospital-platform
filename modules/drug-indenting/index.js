// Drug Indenting module — API router
// Mounted at /api/drug-indenting in the unified server.
// Routes here have no /api prefix — the mount point provides it.

import express from 'express';
import notificationsRouter   from './routes/notifications.js';
import pharmacistDraftsRouter from './routes/pharmacistDrafts.js';
import dashboardRouter       from './routes/dashboard.js';
import analyticsRouter       from './routes/analytics.js';
import quotaRouter           from './routes/quota.js';
import usersRouter           from './routes/users.js';
import dtcRouter             from './routes/dtc.js';
import adminRouter           from './routes/admin.js';
import authRouter            from './routes/auth.js';
import aiRouter              from './routes/ai.js';
import alternativesRouter    from './routes/alternatives.js';
import requestsRouter        from './routes/requests.js';
import miscRouter            from './routes/misc.js';

const router = express.Router();

router.use('/requests',          requestsRouter);
router.use('/notifications',     notificationsRouter);
router.use('/dashboard',         dashboardRouter);
router.use('/analytics',         analyticsRouter);
router.use('/dtc',               dtcRouter);
router.use('/user/quota',        quotaRouter);
router.use('/users',             usersRouter);
router.use('/pharmacist/drafts', pharmacistDraftsRouter);
router.use('/admin',             adminRouter);

// These routers register their own sub-paths (e.g. /login, /register,
// /generics/search) — mounted at / so they sit at the module root.
router.use('/', miscRouter);
router.use('/', aiRouter);
router.use('/', alternativesRouter);
router.use('/', authRouter);

export default router;

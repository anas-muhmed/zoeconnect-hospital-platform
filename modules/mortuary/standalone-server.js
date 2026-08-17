// Minimal standalone host for the Mortuary module's own original Express
// router, run as its own process and reverse-proxied from ZoeConnect's
// Next.js app (see zoeconnect/frontend/next.config.mjs) -- this is what
// lets Mortuary's real, unmodified auth (employee/admin/superadmin login,
// cookie/JWT sessions) work exactly as it does in zoe-platform standalone,
// instead of being bridged through ZoeConnect's own auth system.
import express from 'express';
import cors from 'cors';
import mortuaryRouter from './index.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/api/mortuary', mortuaryRouter);

const port = process.env.PORT || 3011;
app.listen(port, () => console.log(`Mortuary standalone server listening on :${port}`));

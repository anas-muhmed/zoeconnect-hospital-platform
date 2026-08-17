// Minimal standalone host for the Drug Indenting module's own original
// Express router, run as its own process and reverse-proxied from
// ZoeConnect's Next.js app (see zoeconnect/frontend/next.config.mjs) --
// same pattern as mortuary/standalone-server.js, so this module's real,
// unmodified login (userId/password against its own users table) works
// exactly as it does in zoe-platform standalone.
import express from 'express';
import cors from 'cors';
import { initPgPool } from './db/pgPool.js';
import { initDB as initOracleDB } from './db/pool.js';
import drugRouter from './index.js';

// Crash-proofing: an Oracle CRM timeout/disconnect mid-session (e.g. this
// machine leaving the hospital network after boot) throws inside the
// oracledb driver's own internal timers, outside any route's try/catch --
// that previously took the whole process down along with every other
// module's requests it was mid-handling. Log and keep running instead;
// the specific request that triggered it still fails (medicine-search
// routes are the only ones that touch Oracle), everything else is
// unaffected.
process.on('unhandledRejection', (err) => {
  console.error('⚠️  Unhandled rejection (server staying up):', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught exception (server staying up):', err?.message || err);
});

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

await initPgPool();

// Oracle CRM (medicine/company master data, used by misc/medicine-search
// routes) — same non-fatal try/catch as zoe-platform's own server.js: if
// unreachable, those specific routes error at request time instead of
// crashing the whole process at boot.
try {
  await initOracleDB();
  console.log('✅  Oracle CRM connected');
} catch (err) {
  console.warn('⚠️  Oracle CRM unavailable — misc/medicine-search routes will error until reachable:', err.message);
}

app.use('/api/drug-indenting', drugRouter);

const port = process.env.PORT || 3012;
app.listen(port, () => console.log(`Drug Indenting standalone server listening on :${port}`));

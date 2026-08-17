// Oracle connection pool — the one shared dependency every route needs.
// Moved out of server.js so route files (routes/*.js) can import getConn()
// without needing server.js itself.

import oracledb from 'oracledb';

let pool;

export async function initDB() {
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.autoCommit = true;
  oracledb.fetchAsString = [oracledb.CLOB];

  pool = await oracledb.createPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
    // poolMin was 0 -- every request after the pool had been idle paid the
    // full cost of a fresh Oracle connection (TCP handshake + session
    // negotiation) before it could even run its query. Keeping a small
    // number of connections warm removes that cold-start penalty from the
    // request path entirely. Configurable via env var, defaulting to 2
    // (safe for this app's real scale -- currently ~8 total active users).
    poolMin: Number(process.env.DB_POOL_MIN) || 2,
    poolMax: 10,
    poolIncrement: 1,
  });
  console.log('✅  Oracle DB pool created');
}

export async function getConn() {
  return pool.getConnection();
}

export function isPoolReady() {
  return !!pool;
}

// Drains in-flight connections (up to 10s) then closes the pool -- used on
// graceful shutdown so in-progress requests get a chance to finish instead
// of having their DB connection yanked out from under them.
export async function closePool() {
  if (pool) {
    await pool.close(10);
    pool = undefined;
  }
}

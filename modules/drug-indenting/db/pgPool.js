// Postgres connection pool — parallel to db/pool.js (Oracle) during the
// incremental migration. Only routes that have actually been converted
// (see migration/docs/route-conversion-plan.md) import from here; every
// other route still imports db/pool.js. Both pools are initialized at
// boot so converted and not-yet-converted routes work side by side.
//
// Uses node-postgres's own built-in pool.query() for one-shot queries —
// no manual connect()/release() needed unless a route needs a real
// transaction (none of the converted routes have needed one yet).

import pg from 'pg';

let pool;

export async function initPgPool() {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Mortuary and Drug Indenting now share one Postgres database, each in
    // its own schema (both had an unrelated table literally named "users").
    // This scopes every unqualified table name in this module's queries to
    // drug_indenting, with public as fallback -- no query needed to change.
    options: '-c search_path=drug_indenting,public',
  });
  // Supabase's session pooler doesn't honor a `-c timezone=...` startup
  // option (verified directly), only search_path -- set per-connection via
  // an explicit query instead. Without this, every createdAt/updatedAt
  // DEFAULT CURRENT_TIMESTAMP column (16 of them in this schema) came back
  // 5.5 hours off from a JS Date written for the same real instant. See
  // mortuary/config/db.js's pool.on('connect', ...) for the full mechanism
  // -- both pools need this since both share the same Supabase project.
  pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'Asia/Kolkata'").catch(() => {});
  });
  // Fail fast at boot rather than on the first request if the connection
  // string is wrong -- same reasoning as Oracle's pool giving a clear
  // startup error instead of a confusing first-request failure.
  await pool.query('SELECT 1');
  console.log('✅  Postgres pool created');
}

export function getPgPool() {
  return pool;
}

export function isPgPoolReady() {
  return !!pool;
}

export async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

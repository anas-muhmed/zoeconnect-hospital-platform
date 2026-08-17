import pg from 'pg';

const { Pool } = pg;

// ── Connection pool ──────────────────────────────────────────────────────────
// Mortuary and Drug Indenting now share one Postgres database (one Supabase
// project), each in its own schema to avoid collisions like both modules
// having an unrelated table literally named "users". search_path here scopes
// every unqualified table name in this module's queries to the mortuary
// schema, with public as fallback -- no query in this module needed to
// change.
export const pool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     parseInt(process.env.PG_PORT || '5432'),
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD || 'root',
  database: process.env.PG_DATABASE || 'mortuary_db',
  options:  '-c search_path=mortuary,public',
});

// Supabase's session pooler does not honor a `-c timezone=...` startup
// option the way it honors search_path (verified directly -- setting it
// via `options` above had zero effect), so it has to be set per-connection
// via an explicit query instead. Without this, the session's timezone was
// left at whatever the pooler's backend connection defaults to, which is
// NOT UTC despite `SHOW timezone` claiming otherwise for a plain SELECT --
// concretely, CURRENT_TIMESTAMP/NOW() (used by every createdAt/updatedAt
// DEFAULT CURRENT_TIMESTAMP column in this schema) came back 5.5 hours
// off from a JS Date written moments earlier for the exact same instant.
// Setting the session to this deployment's actual local timezone (not UTC)
// is the correct fix, not a workaround: `pg` itself always serializes a
// bound JS Date parameter, and always parses a naive timestamp column back
// into a JS Date, using this SESSION's timezone -- so as long as writes
// and reads agree on what "local" means, both JS-Date-sourced values
// (e.g. admissionDateTime) and server-computed values (CURRENT_TIMESTAMP
// defaults, NOW()) round-trip consistently, matching real wall-clock time.
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'Asia/Kolkata'").catch(() => {});
});

// ── Query helpers ────────────────────────────────────────────────────────────

/**
 * Convert MySQL ? placeholders to PostgreSQL $1, $2, ... placeholders.
 */
function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Return all rows */
export async function queryAll(sql, params = []) {
  const { rows } = await pool.query(toPostgres(sql), params);
  return rows;
}

/** Return first row or null */
export async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

/** INSERT / UPDATE / DELETE — returns the pg result object */
export async function runQuery(sql, params = []) {
  return pool.query(toPostgres(sql), params);
}

// ── Body-number generator ─────────────────────────────────────────────────────
// Prefixed with the hospital's own Client ID (e.g. "SUNH8261-2026-0001"),
// not a hardcoded "MOSC-" - every hospital's bodies used to be numbered
// with MOSC's own prefix and share one global sequence, regardless of which
// hospital actually registered them. The sequence is also now scoped to
// that hospital's own bodies via hospital_id, not just a LIKE-prefix match
// on bodyNumber, so each hospital starts its own count at 0001.
export async function generateBodyNumber(hospitalId) {
  try {
    const hospital = await queryOne('SELECT client_id FROM hospitals WHERE id = $1', [hospitalId]);
    const clientId = hospital?.client_id || 'HOSP';
    const year   = new Date().getFullYear();
    const prefix = `${clientId}-${year}-`;
    const bodies = await queryAll(
      'SELECT "bodyNumber" FROM bodies WHERE hospital_id = $1 AND "bodyNumber" LIKE $2',
      [hospitalId, `${prefix}%`]
    );
    let maxNum = 0;
    for (const body of bodies) {
      const num = parseInt((body.bodyNumber || body['bodyNumber']).replace(prefix, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
    return `${prefix}${(maxNum + 1).toString().padStart(4, '0')}`;
  } catch (error) {
    throw new Error('Failed to generate body number: ' + error.message);
  }
}

// ── Tenant scoping helper ─────────────────────────────────────────────────────
// hospitalId === null means SuperAdmin (no single-hospital scope) - the filter
// is skipped entirely so SuperAdmin queries see/manage every hospital's data.
// Usage: build params up to the point of use, then:
//   const hc = hospitalClause(req.hospitalId, params.length + 1, 'b.hospital_id');
//   query += hc.sql; params.push(...hc.params);
export function hospitalClause(hospitalId, idx, column = 'hospital_id') {
  return hospitalId == null
    ? { sql: '', params: [] }
    : { sql: ` AND ${column} = $${idx}`, params: [hospitalId] };
}



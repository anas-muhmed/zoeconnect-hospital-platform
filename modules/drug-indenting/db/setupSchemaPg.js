// Run once to create the Drug Indenting Postgres schema from scratch.
// Usage: node src/modules/drug-indenting/db/setupSchemaPg.js
//
// Applies drug_indenting_schema.sql (a plain pg_dump --schema-only of the
// live drug_indenting schema) against whatever Postgres server DATABASE_URL
// points at -- local or Supabase, doesn't matter, the file is self-contained
// (creates the drug_indenting schema itself, fully-qualifies every table).
//
// Safe to re-run: CREATE SCHEMA uses IF NOT EXISTS, and CREATE TABLE will
// simply error (not silently overwrite) if the tables already exist -- this
// is a from-scratch setup script, not a migration tool.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(__dirname, 'drug_indenting_schema.sql'), 'utf8');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log('✅  drug_indenting schema created.');
} catch (err) {
  console.error('❌  Schema setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

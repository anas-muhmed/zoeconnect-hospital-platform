const { Client } = require('pg');

async function run() {
  const client = new Client({
    user: 'hdsp_app',
    host: 'localhost',
    database: 'hdsp_db',
    password: 'dev_password_change_in_prod',
    port: 5432,
  });
  await client.connect();
  await client.query('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;');
  await client.query('ALTER TABLE incident_rca ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;');
  await client.query('ALTER TABLE incident_investigations ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;');
  await client.query('ALTER TABLE incident_capa ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;');
  console.log('Columns added!');
  await client.end();
}
run().catch(console.error);

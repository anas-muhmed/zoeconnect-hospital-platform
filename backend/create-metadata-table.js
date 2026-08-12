const { Client } = require('pg');

async function run() {
  const c = new Client('postgres://hdsp_app:dev_password_change_in_prod@localhost:5432/hdsp_db');
  await c.connect();
  
  await c.query(`
    CREATE TABLE IF NOT EXISTS typeorm_metadata (
      type varchar(255) NOT NULL, 
      database varchar(255), 
      schema varchar(255), 
      "table" varchar(255), 
      name varchar(255), 
      value text
    )
  `);
  console.log('Metadata table created');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});

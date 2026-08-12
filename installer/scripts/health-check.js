const http = require('http');
const { Client } = require('../backend/node_modules/pg');

const args = process.argv.slice(2);
const config = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.split('=');
    config[key.substring(2)] = value || '';
  }
});

function pingHttp(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function checkDatabase() {
  const client = new Client({
    host: config['db-host'] || 'localhost',
    port: parseInt(config['db-port'] || '5432', 10),
    user: config['db-user'] || 'hdsp_app',
    password: config['db-password'] || 'hdsp_pass',
    database: config['db-name'] || 'hdsp_db',
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch (e) {
    return false;
  }
}

async function runHealthChecks() {
  console.log("=== HDSP Health Check ===");
  
  // Wait 10 seconds for services to fully boot via NSSM
  console.log("Waiting 10 seconds for Windows Services to stabilize...");
  await new Promise(r => setTimeout(r, 10000));

  const results = {
    PostgreSQL: await checkDatabase(),
    Backend: await pingHttp(`http://localhost:3001/api/health`),
    Frontend: await pingHttp(`http://localhost:3000/`),
    VendorBackend: await pingHttp(`http://localhost:4000/api/health`),
    VendorFrontend: await pingHttp(`http://localhost:4001/`),
  };

  let allPassed = true;
  for (const [service, passed] of Object.entries(results)) {
    if (passed) {
      console.log(`[PASS] ${service}`);
    } else {
      console.log(`[FAIL] ${service}`);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log("All services are healthy.");
    process.exit(0);
  } else {
    console.warn("Some services failed the health check.");
    process.exit(1);
  }
}

runHealthChecks();

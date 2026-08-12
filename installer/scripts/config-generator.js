const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Parse arguments passed by Inno Setup
// Usage: node config-generator.js --install-dir="C:\Program Files\HDSP" --db-host="localhost" ...
const args = process.argv.slice(2);
const config = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.split('=');
    config[key.substring(2)] = value || '';
  }
});

const installDir = config['install-dir'];
if (!installDir) {
  console.error("Missing --install-dir argument");
  process.exit(1);
}

const jwtSecret = crypto.randomBytes(32).toString('hex');
const jwtRefreshSecret = crypto.randomBytes(32).toString('hex');

console.log('Generating backend .env...');
const backendEnvPath = path.join(installDir, 'backend', '.env');
const backendEnvContent = `NODE_ENV=production
PORT=3001
# Single source of truth for cloud vs self-hosted behavior across the whole
# stack (backend config + frontend, which reads it live via GET
# /license/status) -- see deployment.config.ts. Must be lowercase:
# env.validation.ts's Joi schema only accepts 'cloud' or 'self_hosted'
# (was previously generated here as 'SELF_HOSTED', which would have
# failed startup env validation).
DEPLOYMENT_MODE=self_hosted

# PostgreSQL
DB_HOST=${config['db-host'] || 'localhost'}
DB_PORT=${config['db-port'] || '5432'}
DB_NAME=${config['db-name'] || 'hdsp_db'}
DB_USER=${config['db-user'] || 'hdsp_app'}
DB_PASSWORD=${config['db-password'] || 'hdsp_pass'}

# Redis
REDIS_HOST=${config['redis-host'] || 'localhost'}
REDIS_PORT=${config['redis-port'] || '6379'}
REDIS_PASSWORD=${config['redis-password'] || ''}

# JWT
JWT_SECRET=${jwtSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}

# License
# Points at backend/keys/license-public.pem, NOT backend/src/modules/
# licensing/license.public.pem -- fixed 2026-07-24. The installer
# (installer/HDSP.iss) only ever packages "backend\dist\*", never
# "backend\src\*", so a path under src/ can NEVER resolve on any
# self-hosted install regardless of whether the file exists in the repo --
# this was a genuine dead-end path, found while diagnosing a Vendor Portal
# "License private key not found" error and tracing the matching
# public-key side of the same one-time-generated RSA keypair
# (scripts/generate-license.ts). backend/keys/ is a plain asset folder
# HDSP.iss now packages alongside dist/, so the public key ships
# automatically with every self-hosted build once placed there ONE TIME on
# the build machine -- see backend/keys/README.md.
LICENSE_PUBLIC_KEY_PATH=${path.join(installDir, 'backend', 'keys', 'license-public.pem').replace(/\\/g, '/')}
LICENSE_TRIAL_DAYS=30

# Oracle HIS
ORACLE_HOST=${config['oracle-host'] || ''}
ORACLE_PORT=${config['oracle-port'] || '1521'}
ORACLE_SERVICE=${config['oracle-service'] || ''}
ORACLE_USER=${config['oracle-user'] || ''}
ORACLE_PASSWORD=${config['oracle-password'] || ''}
ORACLE_INSTANT_CLIENT_PATH=${(config['oracle-path'] || '').replace(/\\/g, '/')}
`;
fs.writeFileSync(backendEnvPath, backendEnvContent, 'utf8');

console.log('Generating frontend .env.local...');
const frontendEnvPath = path.join(installDir, 'frontend', '.env.local');
// NEXT_PUBLIC_DEPLOYMENT_MODE intentionally not written here (single-
// source-of-truth fix): the frontend now reads deployment mode live from
// the backend's GET /license/status at runtime instead of a build-time
// env var, so DEPLOYMENT_MODE only needs to be set once, in the backend
// .env generated above.
const frontendEnvContent = `NEXT_PUBLIC_API_URL=${config['frontend-api-url'] || 'http://localhost:3001'}/api/v1
`;
fs.writeFileSync(frontendEnvPath, frontendEnvContent, 'utf8');

console.log('Generating vendor backend .env...');
const vendorBackendEnvPath = path.join(installDir, 'vendor-portal', 'backend', '.env');
const vendorBackendEnvContent = `NODE_ENV=production
PORT=4000

# PostgreSQL (Vendor DB)
DB_HOST=${config['db-host'] || 'localhost'}
DB_PORT=${config['db-port'] || '5432'}
DB_NAME=${config['vendor-db-name'] || 'hdsp_vendor_db'}
DB_USER=${config['db-user'] || 'hdsp_app'}
DB_PASSWORD=${config['db-password'] || 'hdsp_pass'}

# JWT
JWT_SECRET=${crypto.randomBytes(32).toString('hex')}

# Admin
DEFAULT_ADMIN_PASSWORD=Admin123!
`;
if (fs.existsSync(path.dirname(vendorBackendEnvPath))) {
    fs.writeFileSync(vendorBackendEnvPath, vendorBackendEnvContent, 'utf8');
}

console.log('Generating vendor frontend .env.local...');
const vendorFrontendEnvPath = path.join(installDir, 'vendor-portal', 'frontend', '.env.local');
const vendorFrontendEnvContent = `NEXT_PUBLIC_API_URL=${config['vendor-frontend-api-url'] || 'http://localhost:4000'}/api/v1
`;
if (fs.existsSync(path.dirname(vendorFrontendEnvPath))) {
    fs.writeFileSync(vendorFrontendEnvPath, vendorFrontendEnvContent, 'utf8');
}

console.log('Configuration generated successfully.');

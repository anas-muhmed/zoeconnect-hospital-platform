import { registerAs } from '@nestjs/config';

export const oracleConfig = registerAs('oracle', () => ({
  host: process.env.ORACLE_HOST || 'localhost',
  port: parseInt(process.env.ORACLE_PORT || '1521', 10),
  service: process.env.ORACLE_SERVICE || 'HISDB',
  user: process.env.ORACLE_USER || 'HDSP_READONLY',
  password: process.env.ORACLE_PASSWORD || '',
  // Connection string format for node-oracledb
  connectString: `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${process.env.ORACLE_HOST || 'localhost'})(PORT=${process.env.ORACLE_PORT || '1521'}))(CONNECT_DATA=(SERVICE_NAME=${process.env.ORACLE_SERVICE || 'HISDB'})))`,
  pool: {
    min: parseInt(process.env.ORACLE_POOL_MIN || '2', 10),
    max: parseInt(process.env.ORACLE_POOL_MAX || '20', 10),
    increment: parseInt(process.env.ORACLE_POOL_INCREMENT || '2', 10),
    connectTimeout: parseInt(process.env.ORACLE_CONNECT_TIMEOUT || '30', 10),
    queueTimeout: parseInt(process.env.ORACLE_QUEUE_TIMEOUT || '60000', 10),
    pingInterval: 60,            // Keepalive every 60 seconds
    stmtCacheSize: 30,           // Prepared statement cache per connection
    homogeneous: true,
  },
  mode: process.env.ORACLE_MODE || 'thick',
  instantClientPath: process.env.ORACLE_INSTANT_CLIENT_PATH || '/opt/oracle/instantclient',
  // Maximum retries on connection failure (exponential backoff)
  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    multiplier: 2,
  },
  // Tenant-scoped Oracle pools (OraclePoolManager, 2026-07-21, Phase 3):
  // how long a non-default tenant's idle Oracle pool stays open before
  // being closed/evicted. The default/self-hosted pool is never evicted.
  tenantPoolIdleTimeoutMs: parseInt(process.env.ORACLE_TENANT_POOL_IDLE_TIMEOUT_MS || String(30 * 60 * 1000), 10),
}));

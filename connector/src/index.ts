import { OracleClient } from '@hdsp/oracle-client';
import { Connector } from './connector';
import { SqlTemplateRegistry } from './protocol/sql-template-registry';
import { RedisMessageTransport } from './transport/redis-message-transport';
import { startHealthServer } from './health';
import { ConnectorRuntime } from './runtime/connector-runtime';
// NOTE: deliberately NOT a top-level `import { startLocalApiServer } from
// './api/local-api-server'` here, and deliberately NOT re-exported below
// either (grep confirms nothing outside connector/src ever imports
// createLocalApiServer/startLocalApiServer from '@hdsp/connector' -- it is
// purely this file's own standalone-process entrypoint's business). See
// this file's mainWebSocket() for why: local-api-server.ts imports
// `express` as a real runtime value (Router(), the default export), and a
// static re-export here would make simply `require('@hdsp/connector')`
// (e.g. backend/cloud-oracle.transport.ts, which only ever needs
// RedisMessageTransport) eagerly load Express too -- backend/package.json
// has no reason to depend on express at all. This is the exact same class
// of bug fixed for socket.io-client in websocket-message-transport.ts's
// start() (see that file's doc comment): a consumer that only wants a
// couple of exported symbols was being forced to pull in every dependency
// of every file this package happens to also contain. Found 2026-07-23
// when a UAT self-hosted install crashed with Cannot find module 'express'
// immediately after the socket.io-client fix closed the first instance of
// this same bug class.

export { Connector } from './connector';
export { SqlTemplateRegistry, UnknownSqlTemplateError } from './protocol/sql-template-registry';
export type { SqlTemplateDefinition, SqlTemplateKind } from './protocol/sql-template-registry';
export { RedisMessageTransport } from './transport/redis-message-transport';
export { WebSocketMessageTransport } from './transport/websocket-message-transport';
export type {
  IMessageTransport,
  MessageTransportRequest,
  MessageTransportResponse,
} from './protocol/message-transport.interface';
export type { SyncedTemplateDefinition } from './protocol/sync-templates.interface';
export { startHealthServer } from './health';
export { TokenStore } from './auth/token-store';
export { registerConnector, refreshConnectorToken } from './auth/registration';
export type { ConnectorCredentials } from './auth/registration';
export { ConnectorRuntime } from './runtime/connector-runtime';
export type { ConnectorRuntimeStatus, ActivationResult } from './runtime/connector-runtime';
export { OracleConfigStore, redactOracleConfig } from './config/oracle-config-store';
export type { OracleConnectionConfig } from './config/oracle-config-store';
// createLocalApiServer/startLocalApiServer intentionally NOT re-exported
// here -- see the doc comment above the import block at the top of this
// file for why (Express eager-load bug for library consumers like the
// backend). Import directly from '@hdsp/connector/dist/api/local-api-server'
// in the rare case something other than this file's own mainWebSocket()
// ever needs it.
export { runDiagnostics } from './runtime/diagnostics';
export type { DiagnosticsReport, DiagnosticCheck, DiagnosticStatus } from './runtime/diagnostics';

/**
 * Standalone entrypoint (Phase 6, Task 6.3; rewritten for Task #103
 * "HDSP Connector Manager," 2026-07-22).
 *
 * `CONNECTOR_TRANSPORT=websocket` (now the DEFAULT -- see below) boots the
 * full product experience this task built: `ConnectorRuntime` owns
 * Oracle + the WebSocket pipeline + on-demand activation, and
 * `startLocalApiServer()` serves both the REST API and the built
 * Connector Manager UI on one localhost-only port
 * (`CONNECTOR_MANAGER_PORT`, default 4200). Activation no longer requires
 * `CONNECTOR_TENANT_CODE`/`CONNECTOR_PAIRING_KEY` environment variables at
 * boot -- if no credentials are stored yet, the process starts anyway
 * (Oracle can still be configured/tested) and waits for a
 * `POST /api/activation` call (normally triggered from the Manager UI's
 * Activation page), matching this task's explicit acceptance criteria
 * ("no terminal, .env editing... required").
 *
 * `CONNECTOR_TRANSPORT=redis` remains available (unchanged from Phase 6)
 * for local/CI development against the legacy Redis pub/sub transport --
 * that path predates the Manager UI entirely and does not start it; see
 * `ADR_CONNECTOR_PROTOCOL.md` §4 for why Redis stays a dev-only path
 * rather than gaining equivalent product-UI treatment.
 *
 * Configuration is still read from environment variables using the same
 * names as the backend's `ORACLE_*`/`REDIS_*` variables where applicable
 * -- but for `websocket` mode, `ORACLE_*` vars are now only a
 * local/CI-convenience FALLBACK (see `ConnectorRuntime
 * .loadOracleConfigWithEnvFallback()`), not the primary source of truth,
 * which is the encrypted `OracleConfigStore` the Manager UI's Oracle page
 * writes to.
 */
async function mainWebSocket(): Promise<void> {
  const runtime = new ConnectorRuntime();
  await runtime.boot();

  const port = process.env.CONNECTOR_MANAGER_PORT ? parseInt(process.env.CONNECTOR_MANAGER_PORT, 10) : 4200;
  // Dynamic import, not a top-level one -- see the doc comment above this
  // file's import block. This function only ever runs when connector.exe
  // itself is the process entry point (require.main === module, below),
  // never when another process (the backend) merely requires this package
  // as a library, so deferring the require('express') chain to here is
  // exactly as safe as it looks.
  const { startLocalApiServer } = await import('./api/local-api-server');
  startLocalApiServer(runtime, port);
  // eslint-disable-next-line no-console
  console.log(`[CONNECTOR] HDSP Connector Manager listening on http://127.0.0.1:${port}`);

  process.on('SIGTERM', () => void runtime.stop());
  process.on('SIGINT', () => void runtime.stop());
}

/**
 * Legacy Redis-transport entrypoint (Phase 6/7, unchanged). Requires a
 * pairing key redeemed out-of-band already... actually requires nothing
 * activation-related at all -- `RedisMessageTransport` has no auth
 * handshake (see its own file), matching its "legacy/dev-only" status.
 */
async function mainRedis(): Promise<void> {
  const templates = new SqlTemplateRegistry();
  templates.register({
    id: 'health-check-select-1',
    kind: 'query',
    sql: 'SELECT 1 FROM dual',
    expectedBinds: [],
    description: 'Minimal conformance/pilot query — proves the Connector round-trip end-to-end.',
  });
  templates.register({
    id: 'patient-search',
    kind: 'query',
    sql: "SELECT patient_id AS \"mrn\", first_name AS \"firstName\", last_name AS \"lastName\" FROM patients WHERE UPPER(first_name) LIKE :nameMatch FETCH FIRST 20 ROWS ONLY",
    expectedBinds: ['nameMatch'],
    description: 'Representative parameterized patient-search conformance query.',
  });

  const oracleClient = new OracleClient({
    host: process.env.ORACLE_HOST,
    port: process.env.ORACLE_PORT ? parseInt(process.env.ORACLE_PORT, 10) : undefined,
    service: process.env.ORACLE_SERVICE,
    user: process.env.ORACLE_USER ?? '',
    password: process.env.ORACLE_PASSWORD ?? '',
    mode: (process.env.ORACLE_MODE as 'thick' | 'thin') ?? 'thin',
    instantClientPath: process.env.ORACLE_INSTANT_CLIENT_PATH,
  });

  const transport = new RedisMessageTransport(
    process.env.REDIS_URL ?? `redis://${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`,
  );

  const connector = new Connector(oracleClient, transport, templates);
  await connector.start();

  const healthPort = process.env.CONNECTOR_HEALTH_PORT ? parseInt(process.env.CONNECTOR_HEALTH_PORT, 10) : 4100;
  startHealthServer(connector, healthPort);
  // eslint-disable-next-line no-console
  console.log(`[CONNECTOR] Health check listening on :${healthPort}/health`);

  process.on('SIGTERM', () => void connector.stop());
  process.on('SIGINT', () => void connector.stop());
}

async function main(): Promise<void> {
  // Default flipped to 'websocket' with this task -- the product this
  // whole roadmap (D.1-D.6, Task #101/#102/#103) has been building only
  // exists on this path. 'redis' remains opt-in for legacy/dev use.
  const transportMode = process.env.CONNECTOR_TRANSPORT ?? 'websocket';
  if (transportMode === 'redis') {
    await mainRedis();
  } else {
    await mainWebSocket();
  }
}

if (require.main === module) {
  void main();
}

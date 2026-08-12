import * as os from 'os';
import * as path from 'path';
import { OracleClient } from '@hdsp/oracle-client';
import { Connector } from '../connector';
import { SqlTemplateRegistry } from '../protocol/sql-template-registry';
import { WebSocketMessageTransport } from '../transport/websocket-message-transport';
import { TokenStore } from '../auth/token-store';
import { registerConnector } from '../auth/registration';
import { OracleConfigStore, OracleConnectionConfig, redactOracleConfig } from '../config/oracle-config-store';
import { LogBuffer, LogEntry, LogLevel } from './log-buffer';
import { runDiagnostics, DiagnosticsReport } from './diagnostics';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: CONNECTOR_VERSION } = require('../../package.json');

export interface ConnectorRuntimeStatus {
  activated: boolean;
  hospital: { tenantId: string | null; connectorId: string | null; hostname: string | null };
  cloud: { connected: boolean; url: string | null };
  oracle: { connected: boolean; target: string | null };
  definitions: { count: number };
  version: string;
  lastSyncAt: string | null;
}

export interface ActivationResult {
  tenantId: string;
  connectorId: string;
}

/**
 * ConnectorRuntime (Task #103, "HDSP Connector Manager," 2026-07-22).
 *
 * The orchestrator every other new piece of this task (the local REST
 * API, the Diagnostics engine, eventually the tray) is built against. It
 * REPLACES `index.ts`'s previous `main()`/`buildWebSocketTransport()`
 * linear boot sequence with something restartable and event-driven,
 * because the acceptance criteria requires activation to happen ON DEMAND
 * from the Manager UI (a `POST /api/activation` call after the process is
 * already running), not only at process boot via environment variables
 * the way the old flow required (`CONNECTOR_TENANT_CODE`/
 * `CONNECTOR_PAIRING_KEY`, read once in `main()` and fatal if missing).
 *
 * Boot behavior is now genuinely two-branch:
 *  - Stored credentials already exist (`TokenStore.load()` succeeds) --
 *    same as before, the pipeline (Oracle + WebSocket transport +
 *    `Connector`) starts immediately.
 *  - No stored credentials -- this is NOT fatal anymore. The process
 *    stays up, the local REST API + Manager UI are still served, and
 *    `getStatus()` honestly reports `activated: false`. The pipeline only
 *    starts once `activate()` is called (from the UI) and succeeds.
 *
 * Oracle behaves the same way independent of activation: config is loaded
 * from `OracleConfigStore` (falling back to `ORACLE_*` env vars purely for
 * local/CI developer convenience -- see that store's own doc comment) and
 * connected best-effort at boot, exactly like the old `main()` did,
 * regardless of whether the connector has been activated yet -- a
 * hospital IT admin can (and per the acceptance workflow, does) configure
 * and Test Connection Oracle BEFORE activating.
 */
export class ConnectorRuntime {
  readonly logs = new LogBuffer();
  readonly templates = new SqlTemplateRegistry();
  readonly oracleConfigStore: OracleConfigStore;
  private readonly tokenStore: TokenStore;
  private readonly cloudUrl: string | undefined;
  private readonly configDir: string;

  private oracleClient!: OracleClient;
  private wsTransport: WebSocketMessageTransport | null = null;
  private connector: Connector | null = null;
  private lastSyncAt: string | null = null;
  private activation: ActivationResult | null = null;

  constructor(opts: { cloudUrl?: string; configDir?: string } = {}) {
    this.cloudUrl = opts.cloudUrl ?? process.env.CONNECTOR_CLOUD_URL;
    this.configDir = opts.configDir
      ?? process.env.CONNECTOR_CONFIG_DIR
      ?? (process.platform === 'win32'
        ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'HDSP', 'Connector')
        : '/etc/hdsp-connector');
    this.tokenStore = new TokenStore(opts.configDir);
    this.oracleConfigStore = new OracleConfigStore(opts.configDir);
    this.registerConformanceTemplates();
  }

  /**
   * The same two conformance templates `index.ts`'s old `main()`
   * registered unconditionally -- moved here verbatim (not re-derived) so
   * the pilot/conformance behavior this task inherited is unchanged. See
   * the original comments in `index.ts`'s git history for why these exist
   * and their documented limitations (representative, not real per-tenant
   * SQL).
   */
  private registerConformanceTemplates(): void {
    this.templates.register({
      id: 'health-check-select-1',
      kind: 'query',
      sql: 'SELECT 1 FROM dual',
      expectedBinds: [],
      description: 'Minimal conformance/pilot query — proves the Connector round-trip end-to-end.',
    });
  }

  private oracleConfigToClientOptions(config: OracleConnectionConfig) {
    return {
      host: config.host,
      port: config.port,
      service: config.serviceName,
      user: config.username,
      password: config.password,
      mode: config.mode ?? 'thin' as const,
      instantClientPath: config.instantClientPath,
    };
  }

  private oracleConfigToReconfigureCreds(config: OracleConnectionConfig) {
    return {
      host: config.host,
      port: String(config.port),
      service: config.serviceName,
      user: config.username,
      password: config.password,
      mode: config.mode ?? 'thin',
    };
  }

  private loadOracleConfigWithEnvFallback(): OracleConnectionConfig | null {
    const stored = this.oracleConfigStore.load();
    if (stored) return stored;

    // Local/CI developer convenience only -- see OracleConfigStore's doc
    // comment. Not the production activation path.
    if (process.env.ORACLE_HOST && process.env.ORACLE_SERVICE) {
      return {
        host: process.env.ORACLE_HOST,
        port: process.env.ORACLE_PORT ? parseInt(process.env.ORACLE_PORT, 10) : 1521,
        serviceName: process.env.ORACLE_SERVICE,
        username: process.env.ORACLE_USER ?? '',
        password: process.env.ORACLE_PASSWORD ?? '',
        mode: (process.env.ORACLE_MODE as 'thick' | 'thin') ?? 'thin',
        instantClientPath: process.env.ORACLE_INSTANT_CLIENT_PATH,
      };
    }
    return null;
  }

  async boot(): Promise<void> {
    const oracleConfig = this.loadOracleConfigWithEnvFallback();
    this.oracleClient = new OracleClient(
      oracleConfig
        ? this.oracleConfigToClientOptions(oracleConfig)
        // No Oracle config yet at all (fresh install, nothing entered in
        // the UI yet either) -- still construct a client so `isAvailable`
        // etc. are well-defined, just with empty credentials (connect()
        // will log-and-continue exactly like OraclePoolService always has
        // for an unconfigured pool).
        : { user: '', password: '' },
      this.logs.asLogger(),
    );
    await this.oracleClient.connect();

    const credentials = this.tokenStore.load();
    if (credentials) {
      this.activation = { tenantId: credentials.tenantId, connectorId: credentials.connectorId };
      await this.startPipeline();
    } else {
      this.logs.push('info', 'Connector is not activated yet -- waiting for an Activation Code via the Connector Manager UI');
    }
  }

  /** Starts the WebSocket transport + Connector -- shared by boot() (already-activated) and activate() (just-activated). Idempotent: no-ops if already started. */
  private async startPipeline(): Promise<void> {
    if (this.connector) return;
    if (!this.cloudUrl) {
      throw new Error('CONNECTOR_CLOUD_URL is not configured -- cannot start the cloud pipeline');
    }

    const transport = new WebSocketMessageTransport({
      cloudUrl: this.cloudUrl,
      getAccessToken: async () => {
        const stored = this.tokenStore.load();
        return stored?.accessToken ?? (await this.tokenStore.refreshAndPersist(this.cloudUrl!)).accessToken;
      },
      logger: this.logs.asLogger(),
    });

    transport.onTemplateSync((definitions) => {
      for (const def of definitions) {
        this.templates.registerOrReplace({
          id: def.sqlTemplateId,
          kind: def.kind,
          sql: def.sql,
          expectedBinds: def.expectedBinds,
          description: `Synced queryId="${def.queryId}" (definitionVersion=${def.definitionVersion}, checksum=${def.checksum})`,
        });
      }
      this.lastSyncAt = new Date().toISOString();
      this.logs.push('info', `Received ${definitions.length} definition(s) from cloud sync`);
    });

    this.wsTransport = transport;
    this.connector = new Connector(this.oracleClient, transport, this.templates, this.logs.asLogger());
    await this.connector.start();
  }

  /**
   * On-demand activation (Task #103's central new capability) -- redeems
   * an Activation Code entered into the Manager UI's Activation page,
   * persists the resulting credentials, and starts the cloud pipeline
   * immediately, all without a process restart. Throws if already
   * activated (see doc comment on `ConnectorRuntimeStatus.activated` --
   * re-activation is a distinct, not-yet-built operation that would need
   * a fresh code and to explicitly discard the current identity, not an
   * accidental side effect of calling this twice).
   */
  async activate(activationCode: string, hostname?: string): Promise<ActivationResult> {
    if (this.activation) {
      throw new Error('This Connector is already activated. Re-activation with a new Activation Code is not supported yet.');
    }
    if (!this.cloudUrl) {
      throw new Error('CONNECTOR_CLOUD_URL is not configured on this machine -- cannot activate');
    }

    this.logs.push('info', 'Activating with cloud backend...');
    const credentials = await registerConnector({
      cloudUrl: this.cloudUrl,
      activationCode,
      hostname: hostname || os.hostname(),
    });
    this.tokenStore.save(credentials);
    this.activation = { tenantId: credentials.tenantId, connectorId: credentials.connectorId };
    this.logs.push('info', `Activated: connectorId=${credentials.connectorId} tenantId=${credentials.tenantId}`);

    await this.startPipeline();
    return this.activation;
  }

  /** Backs the Dashboard/tray "Reconnect" action. No-op (logged) if not yet activated -- there's nothing to reconnect. */
  reconnect(): void {
    if (!this.wsTransport) {
      this.logs.push('warn', 'Reconnect requested but the connector is not activated yet');
      return;
    }
    this.logs.push('info', 'Manual reconnect requested');
    this.wsTransport.forceReconnect();
  }

  /**
   * Backs the Oracle page's "Test Connection" button -- creates a
   * throwaway pool, attempts a real connection, closes it, never touches
   * the live pool or persists anything. Works even before Oracle has ever
   * been configured/activated (per the acceptance workflow: "Configure
   * Oracle -> Test Connection" happens before "Save").
   */
  async testOracleConnection(config: OracleConnectionConfig): Promise<{ ok: boolean; message: string }> {
    return this.oracleClient.reconfigure(this.oracleConfigToReconfigureCreds(config), true);
  }

  /** Backs the Oracle page's "Save" button -- persists (encrypted, see OracleConfigStore) and hot-swaps the live pool, no process restart needed. */
  async saveOracleConfig(config: OracleConnectionConfig): Promise<{ ok: boolean; message: string }> {
    const result = await this.oracleClient.reconfigure(this.oracleConfigToReconfigureCreds(config), false);
    if (result.ok) {
      this.oracleConfigStore.save(config);
      this.logs.push('info', `Oracle configuration saved: ${config.host}:${config.port}/${config.serviceName}`);
    } else {
      this.logs.push('warn', `Oracle configuration save failed: ${result.message}`);
    }
    return result;
  }

  getOracleConfig(): ReturnType<typeof redactOracleConfig> | null {
    const config = this.oracleConfigStore.load();
    return config ? redactOracleConfig(config) : null;
  }

  getStatus(): ConnectorRuntimeStatus {
    return {
      activated: this.activation !== null,
      hospital: {
        tenantId: this.activation?.tenantId ?? null,
        connectorId: this.activation?.connectorId ?? null,
        hostname: os.hostname(),
      },
      cloud: {
        connected: this.wsTransport?.isConnected() ?? false,
        url: this.cloudUrl ?? null,
      },
      oracle: {
        connected: this.oracleClient?.isAvailable ?? false,
        target: this.oracleClient?.isAvailable ? this.oracleClient.connectedTarget : null,
      },
      definitions: { count: this.templates.list().length },
      version: CONNECTOR_VERSION,
      lastSyncAt: this.lastSyncAt,
    };
  }

  getLogs(opts: { level?: LogLevel; limit?: number } = {}): LogEntry[] {
    return this.logs.list(opts);
  }

  async runDiagnostics(): Promise<DiagnosticsReport> {
    return runDiagnostics({
      isOracleAvailable: () => this.oracleClient?.isAvailable ?? false,
      oracleTarget: () => (this.oracleClient?.isAvailable ? this.oracleClient.connectedTarget : null),
      cloudUrl: () => this.cloudUrl ?? null,
      isCloudConnected: () => this.wsTransport?.isConnected() ?? false,
      accessToken: () => this.tokenStore.load()?.accessToken ?? null,
      definitionCount: () => this.templates.list().length,
      configDir: () => this.configDir,
      windowsServiceName: process.env.CONNECTOR_SERVICE_NAME ?? null,
    });
  }

  async stop(): Promise<void> {
    if (this.connector) {
      await this.connector.stop();
      this.connector = null;
      this.wsTransport = null;
    } else {
      await this.oracleClient?.close();
    }
  }

  /**
   * Backs the tray menu's "Restart Connector" item and the local API's
   * `POST /api/restart`. HONEST SCOPE: this restarts the in-process
   * pipeline (closes and re-opens the Oracle pool and the WebSocket
   * transport) -- it does NOT restart the Windows Service / OS process
   * itself. A true service-level restart (`sc.exe stop`/`start` or
   * equivalent) requires the Windows Service installer (Task #95/#96),
   * which doesn't exist yet, and this method deliberately doesn't shell
   * out to guess at a service name that may not be registered. Once that
   * ships, this is the natural place to prefer an OS-level restart when
   * `CONNECTOR_SERVICE_NAME` is set, falling back to this in-process
   * restart otherwise.
   */
  async restart(): Promise<void> {
    this.logs.push('info', 'Restart requested -- reinitializing Oracle and cloud pipeline');
    await this.stop();
    this.activation = null; // boot() re-derives this from TokenStore if credentials are still present
    await this.boot();
  }
}

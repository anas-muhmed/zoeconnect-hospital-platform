import * as path from 'path';
import { SecureJsonStore } from '../security/secure-json-store';

/**
 * Oracle connection config, as entered via the Connector Manager UI's
 * Oracle page (Task #103, 2026-07-22). Deliberately mirrors
 * `OracleClient`'s constructor options (`@hdsp/oracle-client`) field for
 * field, so `oracleConfigToClientOptions()` below is a pure reshape, not a
 * mapping that could silently drop a field.
 */
export interface OracleConnectionConfig {
  host: string;
  port: number;
  serviceName: string;
  username: string;
  password: string;
  mode?: 'thick' | 'thin';
  instantClientPath?: string;
}

const CONFIG_DIR = process.env.CONNECTOR_CONFIG_DIR
  || (process.platform === 'win32'
    ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'HDSP', 'Connector')
    : '/etc/hdsp-connector');

/**
 * Persists `OracleConnectionConfig` encrypted at rest -- see
 * `SecureJsonStore`'s doc comment for the DPAPI-on-Windows /
 * AES-256-GCM-fallback-elsewhere split. This is the store the local REST
 * API's `PUT /api/oracle/config` writes to and `GET /api/oracle/config`
 * (password redacted, see the route handler) reads from; it replaces
 * `ORACLE_HOST`/`ORACLE_PORT`/etc. environment variables as the source of
 * truth once a hospital has saved config through the Manager UI. Falling
 * back to those env vars when this store is empty is still supported (see
 * `connector-runtime.ts`'s `loadOracleConfig()`) purely for local/CI
 * developer convenience -- not the production activation path this task's
 * acceptance criteria describes.
 */
export class OracleConfigStore {
  private readonly store: SecureJsonStore<OracleConnectionConfig>;

  constructor(dir: string = CONFIG_DIR) {
    this.store = new SecureJsonStore<OracleConnectionConfig>(dir, 'oracle-config.enc.json');
  }

  save(config: OracleConnectionConfig): void {
    this.store.save(config);
  }

  load(): OracleConnectionConfig | null {
    return this.store.load();
  }

  clear(): void {
    this.store.clear();
  }

  isConfigured(): boolean {
    return this.load() !== null;
  }
}

/** Redacts the password for any response that echoes config back to the UI -- never round-trip the real password over the local API. */
export function redactOracleConfig(config: OracleConnectionConfig): Omit<OracleConnectionConfig, 'password'> & { passwordSet: true } {
  const { password: _password, ...rest } = config;
  return { ...rest, passwordSet: true };
}

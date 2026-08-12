import { IPgExecutionStrategy, TestConfigurationResult, EngineDescription } from './pg-execution-strategy.interface';

/** Shown to admins and (via PG_TOOLS_NOT_CONFIGURED_MESSAGE-equivalent surfaces) end users whenever no execution strategy could be resolved. Never a raw ENOENT. */
export const PG_ENGINE_UNAVAILABLE_MESSAGE =
  'Database backup tools are not installed on this server. Install PostgreSQL client tools that match your server\'s PostgreSQL version, or configure Docker container access under Backup → Settings → Database Tools → Advanced.';

/**
 * UnavailablePgExecutionStrategy — returned by PgEngineService when nothing
 * could be resolved (no local install, no reachable Docker container, no
 * bundled dir, and no usable explicit override). Every method fails with
 * PG_ENGINE_UNAVAILABLE_MESSAGE (or, for the admin-set-but-incomplete-
 * override case, a more specific guidance message passed in at
 * construction) rather than letting a caller hit a raw ENOENT/undefined.
 */
export class UnavailablePgExecutionStrategy implements IPgExecutionStrategy {
  constructor(private readonly message: string = PG_ENGINE_UNAVAILABLE_MESSAGE) {}

  async dumpDatabase(): Promise<never> {
    throw new Error(this.message);
  }

  async restoreDatabase(): Promise<never> {
    throw new Error(this.message);
  }

  async getDatabaseVersion(): Promise<null> {
    return null;
  }

  async testConfiguration(): Promise<TestConfigurationResult> {
    return { ok: false, message: this.message };
  }

  async describe(): Promise<EngineDescription> {
    return { mode: 'unavailable', version: null, location: 'Not detected', detectedAutomatically: false };
  }
}

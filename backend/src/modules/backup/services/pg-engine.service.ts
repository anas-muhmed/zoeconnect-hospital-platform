import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Readable } from 'stream';
import { BackupToolSettings, BACKUP_TOOL_SETTINGS_SINGLETON_ID } from '../entities/backup-tool-settings.entity';
import { AuditService } from '../../audit/audit.service';
import { PgToolsService } from './pg-tools.service';
import { PgDumpService } from './pg-dump.service';
import { PgDockerDetectionService } from './pg-docker-detection.service';
import { DockerPgExecutionStrategy } from './pg-docker-execution.strategy';
import { BundledPgExecutionStrategy } from './pg-bundled-execution.strategy';
import { UnavailablePgExecutionStrategy, PG_ENGINE_UNAVAILABLE_MESSAGE } from './pg-unavailable-execution.strategy';
import { IPgExecutionStrategy, TestConfigurationResult } from './pg-execution-strategy.interface';

export interface EngineStatus {
  status: 'healthy' | 'degraded' | 'unavailable';
  mode: 'local' | 'docker' | 'bundled' | 'unavailable';
  /** Machine-readable admin-selected mode, distinct from `mode` when 'remote' is chosen (which resolves to the same underlying 'local' strategy execution-wise -- see resolveStrategy()'s doc comment). */
  executionMode: 'auto' | 'local' | 'docker' | 'remote' | 'bundled';
  /** Human-facing strategy name for the health card, e.g. "Docker Container" / "Local PostgreSQL Client" / "Remote PostgreSQL" / "Bundled PostgreSQL" / "Unavailable". */
  strategyLabel: string;
  version: string | null;
  location: string;
  detectedAutomatically: boolean;
  /** Only populated when the resolved strategy is Docker. */
  containerName: string | null;
  lastValidatedAt: Date | null;
  lastValidationOk: boolean | null;
  lastValidationMessage: string | null;
}

/** Set by a future ZoeConnect distribution that ships its own PostgreSQL binaries -- when present, PgEngineService skips OS/local/Docker search entirely and always uses the bundled tools. */
const BUNDLED_PG_DIR_ENV = 'BACKUP_BUNDLED_PG_DIR';

/**
 * PgEngineService — the facade BackupService/RestoreService call instead of
 * PgDumpService directly (`dumpDatabase()`/`restoreDatabase()`/
 * `getDatabaseVersion()`, same method names, so the call-site diff is
 * minimal). Resolves WHICH IPgExecutionStrategy should handle the call,
 * every time it's asked (re-resolving per backup/restore job -- not a
 * hot-per-second path, so this is not cached beyond the single job's
 * lifetime).
 *
 * Resolution precedence (exactly, per spec):
 *
 *   1. `BACKUP_BUNDLED_PG_DIR` env var set -> BundledPgExecutionStrategy,
 *      unconditionally -- skip everything else, including OS search. This
 *      is for a future ZoeConnect-shipped Postgres distribution; not used
 *      today.
 *   2. Admin override (`BackupToolSettings.executionMode` !== 'auto'):
 *        - 'local'  -> PgDumpService (local strategy), directly, no
 *                      detection/testing gate -- the admin explicitly chose
 *                      this.
 *        - 'docker' -> DockerPgExecutionStrategy for
 *                      `dockerContainerName` (the ADMIN-set override field,
 *                      never the auto-detected cache) if set; if
 *                      `dockerContainerName` is missing, falls through to
 *                      UnavailablePgExecutionStrategy with a message
 *                      telling the admin to set it.
 *   3. 'auto' (default): try local first -- a REAL, testable local
 *      pg_dump (PgDumpService.testConfiguration() actually spawns
 *      `--version`, not just a path-exists check) wins. If that fails,
 *      attempt Docker detection (PgDockerDetectionService, best-effort,
 *      never throws). If a container is found, cache its name into
 *      `detectedDockerContainerName` and use DockerPgExecutionStrategy for
 *      it. If neither local nor Docker resolves ->
 *      UnavailablePgExecutionStrategy.
 */
@Injectable()
export class PgEngineService {
  private readonly logger = new Logger(PgEngineService.name);

  constructor(
    @InjectRepository(BackupToolSettings) private readonly repo: Repository<BackupToolSettings>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly pgToolsService: PgToolsService,
    private readonly pgDumpService: PgDumpService,
    private readonly dockerDetectionService: PgDockerDetectionService,
  ) {}

  // ── Row access ────────────────────────────────────────────────────────────

  private async getRow(): Promise<BackupToolSettings | null> {
    return this.repo.findOne({ where: { id: BACKUP_TOOL_SETTINGS_SINGLETON_ID } });
  }

  private async getOrCreateRow(): Promise<BackupToolSettings> {
    const existing = await this.getRow();
    if (existing) return existing;
    const created = this.repo.create({ id: BACKUP_TOOL_SETTINGS_SINGLETON_ID });
    return this.repo.save(created);
  }

  // ── Strategy resolution ──────────────────────────────────────────────────

  async resolveStrategy(): Promise<IPgExecutionStrategy> {
    // 1. Bundled -- always wins, skips OS search entirely, per spec.
    const bundledDir = process.env[BUNDLED_PG_DIR_ENV];
    if (bundledDir) {
      return new BundledPgExecutionStrategy(bundledDir, this.configService);
    }

    const row = await this.getRow();
    const executionMode = row?.executionMode ?? 'auto';

    // 2. Explicit admin override.
    // 'local' and 'remote' share IDENTICAL execution mechanics (PgDumpService
    // spawns pg_dump/pg_restore locally and connects to `database.host`,
    // whatever that is) -- 'remote' exists purely as a distinctly-labeled UI
    // choice for "tools installed here, database elsewhere". describe()'s
    // mode stays 'local' either way; getEngineStatus() reads row.executionMode
    // separately to render the "Remote PostgreSQL" label instead of "Local
    // PostgreSQL Client" when that's what the admin picked.
    if (executionMode === 'local' || executionMode === 'remote') {
      return this.pgDumpService;
    }
    if (executionMode === 'docker') {
      if (!row?.dockerContainerName) {
        return new UnavailablePgExecutionStrategy(
          'Docker execution mode is selected, but no Docker container name is configured. Set the container name under Backup → Settings → Database Tools → Advanced.',
        );
      }
      return new DockerPgExecutionStrategy(row.dockerContainerName, this.configService, false, row.detectedVersion ?? null);
    }
    if (executionMode === 'bundled') {
      const bundledDirOverride = process.env[BUNDLED_PG_DIR_ENV];
      if (!bundledDirOverride) {
        return new UnavailablePgExecutionStrategy(
          'Bundled PostgreSQL execution mode is selected, but this ZoeConnect distribution does not ship bundled PostgreSQL binaries (BACKUP_BUNDLED_PG_DIR is not set).',
        );
      }
      return new BundledPgExecutionStrategy(bundledDirOverride, this.configService);
    }

    // 3. 'auto' -- real, testable local pg_dump first.
    const localCheck = await this.pgDumpService.testConfiguration();
    if (localCheck.ok) {
      return this.pgDumpService;
    }

    // Then best-effort Docker detection.
    const detection = await this.dockerDetectionService.detect();
    if (detection.containerName) {
      await this.getOrCreateRow();
      await this.repo.update(BACKUP_TOOL_SETTINGS_SINGLETON_ID, { detectedDockerContainerName: detection.containerName });
      return new DockerPgExecutionStrategy(detection.containerName, this.configService, true, null);
    }

    return new UnavailablePgExecutionStrategy();
  }

  // ── Façade methods used by BackupService/RestoreService ─────────────────

  async dumpDatabase(): Promise<Readable> {
    const strategy = await this.resolveStrategy();
    return strategy.dumpDatabase();
  }

  async restoreDatabase(source: Readable): Promise<void> {
    const strategy = await this.resolveStrategy();
    return strategy.restoreDatabase(source);
  }

  async getDatabaseVersion(): Promise<string | null> {
    const strategy = await this.resolveStrategy();
    return strategy.getDatabaseVersion();
  }

  // ── UI-facing: health card ───────────────────────────────────────────────

  async getEngineStatus(): Promise<EngineStatus> {
    const [strategy, row] = await Promise.all([this.resolveStrategy(), this.getRow()]);
    const description = await strategy.describe();
    const executionMode = row?.executionMode ?? 'auto';

    const lastValidatedAt = row?.lastTestedAt ?? null;
    const lastValidationOk = row?.lastTestStatus == null ? null : row.lastTestStatus === 'success';
    const lastValidationMessage = row?.lastTestMessage ?? null;

    const status: EngineStatus['status'] = description.mode === 'unavailable'
      ? 'unavailable'
      : lastValidationOk === false
        ? 'degraded'
        : 'healthy';

    const containerName = description.mode === 'docker'
      ? (row?.dockerContainerName || row?.detectedDockerContainerName || null)
      : null;

    return {
      status,
      mode: description.mode,
      executionMode,
      strategyLabel: this.strategyLabel(description.mode, executionMode),
      version: description.version ?? row?.detectedVersion ?? null,
      location: description.location,
      detectedAutomatically: description.detectedAutomatically,
      containerName,
      lastValidatedAt,
      lastValidationOk,
      lastValidationMessage,
    };
  }

  /** Human-facing strategy name for the health card -- see EngineStatus.strategyLabel's doc comment. */
  private strategyLabel(mode: EngineStatus['mode'], executionMode: EngineStatus['executionMode']): string {
    switch (mode) {
      case 'docker':
        return 'Docker Container';
      case 'bundled':
        return 'Bundled PostgreSQL';
      case 'unavailable':
        return 'Unavailable';
      case 'local':
        return executionMode === 'remote' ? 'Remote PostgreSQL' : 'Local PostgreSQL Client';
      default:
        return 'Unknown';
    }
  }

  /**
   * Thin passthrough used by PostgresBackupProvider/BackupDiagnosticsService/
   * BackupHealthCheckService -- resolves the current strategy and runs its
   * testConfiguration(), without persisting the result (unlike validate(),
   * which is the "Validate"/health-check-driven persisted path). Never throws.
   */
  async testConfiguration(): Promise<TestConfigurationResult> {
    const strategy = await this.resolveStrategy();
    return strategy.testConfiguration();
  }

  /** "Validate" button -- runs the current strategy's testConfiguration() and persists the result onto the shared lastTested/lastTestStatus/lastTestMessage columns so getEngineStatus() reflects it. */
  async validate(actorId?: string): Promise<TestConfigurationResult> {
    const strategy = await this.resolveStrategy();
    const result = await strategy.testConfiguration();

    await this.getOrCreateRow();
    await this.repo.update(BACKUP_TOOL_SETTINGS_SINGLETON_ID, {
      lastTestedAt: new Date(),
      lastTestStatus: result.ok ? 'success' : 'failure',
      lastTestMessage: result.message,
      ...(result.pgDumpVersion ? { detectedVersion: result.pgDumpVersion } : {}),
    });

    await this.auditService.log({
      action: 'BACKUP_PG_ENGINE_VALIDATED',
      module: 'BACKUP',
      entityType: 'backup_tool_settings',
      entityId: BACKUP_TOOL_SETTINGS_SINGLETON_ID,
      userId: actorId,
      metadata: { ok: result.ok, message: result.message },
    });

    return result;
  }

  /** "Re-detect Installation" button -- re-runs local detectInstallations() AND Docker detection, updates caches, returns fresh status. */
  async redetect(actorId?: string): Promise<EngineStatus> {
    await this.pgToolsService.detectInstallations();

    const detection = await this.dockerDetectionService.detect();
    await this.getOrCreateRow();
    await this.repo.update(BACKUP_TOOL_SETTINGS_SINGLETON_ID, {
      detectedDockerContainerName: detection.containerName,
    });

    await this.auditService.log({
      action: 'BACKUP_PG_ENGINE_REDETECTED',
      module: 'BACKUP',
      entityType: 'backup_tool_settings',
      entityId: BACKUP_TOOL_SETTINGS_SINGLETON_ID,
      userId: actorId,
      metadata: { dockerContainerName: detection.containerName },
    });

    return this.getEngineStatus();
  }
}

export { PG_ENGINE_UNAVAILABLE_MESSAGE };

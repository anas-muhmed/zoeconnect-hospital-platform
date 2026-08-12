import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../../config/redis.config';
import { HisQueryDefinition } from './entities/his-query-definition.entity';
import { HisQueryTemplateCompiler, IncompleteSchemaConfigError } from './his-query-template-compiler.service';
import { ConnectorDirectoryService } from '../../platform/connector/connector-directory.service';
import { ConnectorGateway, ConnectorConnectedEvent } from '../../platform/connector/connector.gateway';
import type { SyncedTemplateDefinition } from '@hdsp/connector';

/** Job payload for both `publish-full` and `publish-changed` -- see `HisQueryPublishProcessor`. */
export interface HisQueryPublishJobData {
  tenantId: string;
  connectorId?: string;
}

export interface PublishSummary {
  tenantId: string;
  changedQueryIds: string[];
  skippedQueryIds: string[];
  pushed: boolean;
}

/**
 * HisQueryDefinitionPublisherService (D.3, DYNAMIC_HIS_QUERY_ARCHITECTURE.md
 * §5/§6/§7).
 *
 * The Publisher layer sitting between `HisQueryTemplateCompiler` (D.2, a
 * pure function with no memory of prior compiles) and `ConnectorGateway`
 * (the transport). This is where `definitionVersion` bookkeeping actually
 * lives -- comparing a fresh compile's `checksum` against the last one
 * persisted in `HisQueryDefinition`, bumping the version only when they
 * differ, exactly the split described in `CompiledQueryDefinition`'s own
 * doc comment.
 *
 * Two public entry points, matching §7's lifecycle table:
 *  - `publishChanged(tenantId)` -- recompile every queryId, persist +
 *    push only the ones whose checksum actually changed. Wired to the
 *    `HisSchemaConfig` save trigger (`LicenseController`'s
 *    `HIS_CONFIG_UPDATE` handler).
 *  - `publishFull(tenantId, connectorId?)` -- recompile every queryId,
 *    persist any that changed, but push the FULL current set regardless
 *    of whether this call changed them. Wired to the connector
 *    (re)connection trigger via `ConnectorGateway.events` (see that
 *    class's doc comment for why a plain `EventEmitter`, not a new DI
 *    edge, connects these two).
 *
 * D.6 ("production publication lifecycle," 2026-07-22): "Manual republish"
 * is now a real, permanently-available, authenticated operation --
 * `LicenseController`'s `POST /license/his-query-definitions/:tenantId/republish`
 * and `POST /license/connector/:tenantId/resync` routes (both
 * `PLATFORM:SETTINGS:UPDATE`-gated, both audit-logged) call `publishFull()`
 * directly for immediate synchronous feedback to the admin who triggered
 * it. The two AUTOMATIC triggers below (connector reconnect,
 * `HIS_CONFIG_UPDATE` webhook) instead enqueue onto `QUEUE_NAMES.HIS_QUERY_PUBLISH`
 * (`enqueuePublishFull()`/`enqueuePublishChanged()`) so a transient failure
 * (DB blip, brief Redis hiccup) gets Bull's retry/backoff instead of being
 * silently lost until the next reconnect/webhook -- unattended background
 * triggers need that durability; a synchronous admin action watching the
 * HTTP response does not (it gets an immediate, honest failure instead).
 * "Platform upgrade" (§7) is intentionally NOT automated here either --
 * recompiling for every tenant at once, on every backend boot, would
 * silently mask deploys that shouldn't change compiled SQL; per §7, that
 * trigger is meant to be a deliberate, observable rollout step, not an
 * automatic side effect of `onModuleInit()`.
 *
 * A tenant that hasn't configured a given queryId at all (e.g., no
 * `patient.table` set) makes `compiler.compile()` throw
 * `IncompleteSchemaConfigError` -- caught here per-queryId and recorded in
 * `skippedQueryIds` rather than failing the whole publish. A tenant is not
 * required to have every queryId's config filled in before ANY of its
 * definitions can be compiled/pushed.
 */
@Injectable()
export class HisQueryDefinitionPublisherService implements OnModuleInit {
  private readonly logger = new Logger(HisQueryDefinitionPublisherService.name);

  constructor(
    private readonly compiler: HisQueryTemplateCompiler,
    @InjectRepository(HisQueryDefinition) private readonly repo: Repository<HisQueryDefinition>,
    private readonly connectorDirectory: ConnectorDirectoryService,
    private readonly gateway: ConnectorGateway,
    @InjectQueue(QUEUE_NAMES.HIS_QUERY_PUBLISH) private readonly queue: Queue<HisQueryPublishJobData>,
  ) {}

  onModuleInit(): void {
    this.gateway.events.on('connected', (event: ConnectorConnectedEvent) => {
      this.enqueuePublishFull(event.tenantId, event.connectorId).catch((err) =>
        this.logger.error(`Failed to enqueue full template resync for tenant=${event.tenantId} connector=${event.connectorId}: ${(err as Error).message}`),
      );
    });
  }

  /**
   * Durable (Bull-backed, retry/backoff per `bullAsyncOptions`) enqueue of
   * `publishFull()` -- used by the connector-reconnect trigger above. A
   * rejected promise here means enqueueing itself failed (e.g. Redis
   * unreachable), which is a different, more severe failure than a single
   * publish attempt failing -- Bull can't retry a job it was never handed.
   */
  async enqueuePublishFull(tenantId: string, connectorId?: string): Promise<void> {
    await this.queue.add('publish-full', { tenantId, connectorId });
    this.logger.debug(`Enqueued publish-full for tenant=${tenantId}${connectorId ? ` connector=${connectorId}` : ''}`);
  }

  /**
   * Durable (Bull-backed) enqueue of `publishChanged()` -- used by the
   * `HIS_CONFIG_UPDATE` webhook trigger (`LicenseController`).
   */
  async enqueuePublishChanged(tenantId: string): Promise<void> {
    await this.queue.add('publish-changed', { tenantId });
    this.logger.debug(`Enqueued publish-changed for tenant=${tenantId}`);
  }

  async publishChanged(tenantId: string): Promise<PublishSummary> {
    return this.publish(tenantId, { onlyPushChanged: true });
  }

  async publishFull(tenantId: string, connectorId?: string): Promise<PublishSummary> {
    return this.publish(tenantId, { onlyPushChanged: false, connectorId });
  }

  private async publish(
    tenantId: string,
    opts: { onlyPushChanged: boolean; connectorId?: string },
  ): Promise<PublishSummary> {
    const queryIds = this.compiler.listQueryIds();
    const toSend: SyncedTemplateDefinition[] = [];
    const changedQueryIds: string[] = [];
    const skippedQueryIds: string[] = [];

    for (const queryId of queryIds) {
      let compiled;
      try {
        compiled = await this.compiler.compile(tenantId, queryId);
      } catch (err) {
        if (err instanceof IncompleteSchemaConfigError) {
          skippedQueryIds.push(queryId);
          continue;
        }
        throw err;
      }

      const existing = await this.repo.findOne({ where: { tenantId, queryId } });
      const changed = !existing || existing.checksum !== compiled.checksum;
      const definitionVersion = changed ? (existing?.definitionVersion ?? 0) + 1 : existing!.definitionVersion;

      if (changed) {
        await this.repo.upsert(
          {
            tenantId,
            queryId,
            kind: compiled.kind,
            sql: compiled.sql,
            expectedBinds: compiled.expectedBinds,
            checksum: compiled.checksum,
            definitionVersion,
            compiledAt: new Date(compiled.compiledAt),
          },
          { conflictPaths: ['tenantId', 'queryId'] },
        );
        changedQueryIds.push(queryId);
        this.logger.log(
          `Compiled definition changed: tenant=${tenantId} queryId=${queryId} version=${definitionVersion} checksum=${compiled.checksum}`,
        );
      }

      if (!opts.onlyPushChanged || changed) {
        toSend.push({
          queryId,
          sqlTemplateId: queryId,
          kind: compiled.kind,
          sql: compiled.sql,
          expectedBinds: compiled.expectedBinds,
          checksum: compiled.checksum,
          definitionVersion,
        });
      }
    }

    let pushed = false;
    if (toSend.length) {
      const connectorId = opts.connectorId ?? (await this.connectorDirectory.findConnectorIdForTenant(tenantId));
      if (connectorId && this.gateway.isConnected(connectorId)) {
        this.gateway.pushTemplateSync(connectorId, toSend);
        pushed = true;
        this.logger.log(`Pushed ${toSend.length} definition(s) to connector=${connectorId} (tenant=${tenantId})`);
      } else {
        this.logger.debug(`No connected connector for tenant=${tenantId} -- ${toSend.length} definition(s) persisted but not pushed`);
      }
    }

    return { tenantId, changedQueryIds, skippedQueryIds, pushed };
  }

  /**
   * Vendor Portal Connector Management (Task #102, "Onboarding UX,"
   * 2026-07-22) -- read-only summary for the Connector page's health
   * panel. Deliberately does not recompile/publish anything (a status read
   * must never have publish side effects); just reports what's already
   * persisted. `lastCompiledAt` is the most recent of any queryId's
   * `compiledAt`, i.e. "how fresh is this tenant's published definition
   * set as of the last time anything changed" -- not "when was
   * publishFull() last invoked" (a no-op republish, where nothing actually
   * changed, doesn't move this forward, which is the honest answer to
   * "are these still up to date").
   */
  async getDefinitionsSummary(tenantId: string): Promise<{ definitionCount: number; lastCompiledAt: string | null }> {
    const defs = await this.repo.find({ where: { tenantId }, order: { compiledAt: 'DESC' } });
    return {
      definitionCount: defs.length,
      lastCompiledAt: defs[0]?.compiledAt?.toISOString() ?? null,
    };
  }
}

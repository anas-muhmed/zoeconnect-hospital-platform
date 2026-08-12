import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../../config/redis.config';
import { HisQueryDefinitionPublisherService, HisQueryPublishJobData, PublishSummary } from './his-query-definition-publisher.service';

/**
 * HisQueryPublishProcessor (D.6, "production publication lifecycle,"
 * 2026-07-22).
 *
 * The Bull worker side of `HisQueryDefinitionPublisherService.enqueuePublishFull()`/
 * `enqueuePublishChanged()` -- same "deliberately thin, let Bull's own
 * retry/backoff handle transient failure" shape as
 * `ConnectorJobDispatchProcessor` (see that class's doc comment for the
 * shared rationale). Only the two AUTOMATIC triggers (connector reconnect,
 * `HIS_CONFIG_UPDATE` webhook) go through this queue -- manual
 * admin-triggered republish/resync (`LicenseController`) calls the
 * publisher service directly for immediate synchronous HTTP feedback and
 * never touches this processor.
 *
 * A failed job (all `bullAsyncOptions` retry attempts exhausted) is logged
 * at `error` here and otherwise left alone -- per
 * `HisQueryDefinitionPublisherService`'s own doc comment, the next
 * legitimate trigger (another reconnect, another config push, or an
 * admin's manual republish) will simply try again from scratch; there is
 * no partial state to clean up (`publish()` is a pure recompile-and-diff
 * against `HisQueryDefinition`, safe to re-run any number of times).
 */
@Processor(QUEUE_NAMES.HIS_QUERY_PUBLISH)
export class HisQueryPublishProcessor {
  private readonly logger = new Logger(HisQueryPublishProcessor.name);

  constructor(private readonly publisher: HisQueryDefinitionPublisherService) {}

  @Process('publish-full')
  async handlePublishFull(job: Job<HisQueryPublishJobData>): Promise<PublishSummary> {
    const { tenantId, connectorId } = job.data;
    return this.publisher.publishFull(tenantId, connectorId);
  }

  @Process('publish-changed')
  async handlePublishChanged(job: Job<HisQueryPublishJobData>): Promise<PublishSummary> {
    const { tenantId } = job.data;
    return this.publisher.publishChanged(tenantId);
  }

  @OnQueueFailed()
  onFailed(job: Job<HisQueryPublishJobData>, err: Error): void {
    this.logger.error(
      `HIS query definition publish job failed: name=${job.name} tenant=${job.data.tenantId} ` +
      `attempt=${job.attemptsMade} error=${err.message}`,
    );
  }
}

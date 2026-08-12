import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { HisTokenBridgeService, PrintDataDetailPayload } from './his-token-bridge.service';

/**
 * GAP-7: Bull processor for durable HIS print-record retry.
 *
 * When HisTokenBridgeService cannot reach Oracle (unavailable or transient
 * error), it enqueues the payload here. Bull retries with exponential
 * backoff (configured per-job on enqueue) so no print records are silently
 * dropped during Oracle outages.
 *
 * Job name: 'insert-print-record'
 * Queue:    'his-bridge'
 */
@Processor('his-bridge')
export class HisBridgeProcessor {
  private readonly logger = new Logger(HisBridgeProcessor.name);

  constructor(private readonly bridge: HisTokenBridgeService) {}

  @Process('insert-print-record')
  async handleInsert(job: Job<PrintDataDetailPayload>): Promise<void> {
    this.logger.log(
      `[RETRY] Processing his-bridge job #${job.id} ` +
      `token=${job.data.tokenNumber} attempt=${job.attemptsMade + 1}`,
    );

    // Direct Oracle call -- throws on failure so Bull retries according to job options
    await this.bridge.insertPrintRecordDirect(job.data);

    this.logger.log(`[RETRY] his-bridge job #${job.id} succeeded`);
  }
}

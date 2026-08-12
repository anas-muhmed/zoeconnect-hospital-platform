import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_NAMES } from '../../config/redis.config';
import { TransactionService } from './services/transaction.service';

export interface LoyaltyEarnJobData {
  type: 'EARN_FROM_BILL';
  identifier: string;
  billId: string;
  billAmount: number;
  processedBy: string;
  description?: string;
}

/**
 * Async loyalty processor — consumes LOYALTY_EVENTS queue.
 * Used for background earn processing (e.g., batch bill sync from HIS).
 * Direct operator requests use TransactionService synchronously.
 */
@Processor(QUEUE_NAMES.LOYALTY_EVENTS)
export class LoyaltyProcessor {
  private readonly logger = new Logger(LoyaltyProcessor.name);

  constructor(private readonly transactionService: TransactionService) {}

  @Process('earn-from-bill')
  async handleEarnFromBill(job: Job<LoyaltyEarnJobData>): Promise<void> {
    const { identifier, billId, billAmount, processedBy, description } = job.data;
    this.logger.log(`Processing loyalty earn: bill=${billId} identifier=${identifier}`);
    try {
      await this.transactionService.earnFromBill(
        { identifier, billId, billAmount, description },
        processedBy,
      );
    } catch (err) {
      this.logger.error(`Loyalty earn failed for bill ${billId}: ${(err as Error).message}`);
      throw err; // triggers Bull retry
    }
  }
}

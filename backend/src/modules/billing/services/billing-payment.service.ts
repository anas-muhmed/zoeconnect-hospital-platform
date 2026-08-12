import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingPayment } from '../entities/billing-payment.entity';

/**
 * ZoeConnect Billing, Phase 6. Read-only tenant-scoped payment history for
 * the billing management UI. Deliberately just a query surface -- payment
 * WRITES stay entirely inside BillingCheckoutService/WebhookProcessorService
 * (the confirmPayment() transaction), never here.
 */
@Injectable()
export class BillingPaymentService {
  constructor(
    @InjectRepository(BillingPayment) private readonly paymentRepo: Repository<BillingPayment>,
  ) {}

  /** Newest-first. No pagination yet -- see BillingInvoiceService.listForTenant() for the same rationale. */
  async listForTenant(tenantId: string): Promise<BillingPayment[]> {
    return this.paymentRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }
}

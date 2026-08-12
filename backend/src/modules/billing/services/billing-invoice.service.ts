import { Injectable } from '@nestjs/common';
import { Repository, EntityManager } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { BillingInvoice } from '../entities/billing-invoice.entity';
import { BillingPayment } from '../entities/billing-payment.entity';

/**
 * ZoeConnect Billing, Phase 3. Minimal invoice generation -- one invoice
 * row per successful payment. Invoice numbering is timestamp+random
 * (`INV-YYYYMM-<8 hex chars>`), globally unique via the `invoice_number`
 * UNIQUE constraint, NOT a legally-sequential series -- revisit if/when
 * ZoeConnect needs strictly sequential, gap-free invoice numbers for a
 * specific jurisdiction's tax compliance.
 */
@Injectable()
export class BillingInvoiceService {
  constructor(
    @InjectRepository(BillingInvoice) private readonly invoiceRepo: Repository<BillingInvoice>,
  ) {}

  async generateForPayment(payment: BillingPayment, manager?: EntityManager): Promise<BillingInvoice> {
    const repo = manager ? manager.getRepository(BillingInvoice) : this.invoiceRepo;
    const now = new Date();
    const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const invoiceNumber = `INV-${period}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const invoice = repo.create({
      tenantId: payment.tenantId,
      subscriptionId: payment.subscriptionId,
      paymentId: payment.id,
      invoiceNumber,
      amount: payment.amount,
      tax: 0, // tax is already embedded in payment.amount (see SubscriptionPricingService); this column exists for a future itemized-invoice breakout
      currency: payment.currency,
      status: 'ISSUED',
    });
    return repo.save(invoice);
  }

  /**
   * Phase 6: tenant-scoped invoice history for the billing management UI.
   * Read-only, ordered newest-first -- no pagination yet (a tenant
   * accrues at most one invoice per billing cycle, so this stays small
   * for a long time; add limit/offset here first if that changes).
   */
  async listForTenant(tenantId: string): Promise<BillingInvoice[]> {
    return this.invoiceRepo.find({ where: { tenantId }, order: { issuedAt: 'DESC' } });
  }
}

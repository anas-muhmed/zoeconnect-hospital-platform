import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MortuaryBilling } from '../entities/mortuary-billing.entity';
import { MortuaryBillingService as MortuaryBillingServiceEntity } from '../entities/mortuary-billing-service.entity';
import { MortuaryServiceBilling } from '../entities/mortuary-service-billing.entity';
import { MortuaryServiceMaster } from '../entities/mortuary-service-master.entity';
import { MortuaryBody } from '../entities/mortuary-body.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { GenerateMortuaryBillingDto } from '../dto/generate-mortuary-billing.dto';
import { MortuaryRequestContext } from '../mortuary-request-context';
import { MortuarySettingsService } from './mortuary-settings.service';
import { computeNetAmount } from '../utils/billing-math.util';

/**
 * Mortuary integration (Phase 2, Stage C). Ports `billingController.js`.
 * Tenant-scoped.
 *
 * Business invariants preserved:
 *  1. Net amount = gross - advance - discount, NOT clamped at 0 (real
 *     source bug fix, ported as data — see `computeNetAmount`).
 *  2. Staff welfare discount is a per-tenant configured PERCENTAGE
 *     (`MortuarySystemSettings.staffDiscountPercent`), not a hardcoded
 *     100% waiver.
 *  3. A body's own `hospital_id`/tenant is the billing tenant, not
 *     whatever the caller sends — folded into tenant-scoped lookups here.
 *  4. Settling the main stay bill only marks the body's overall
 *     `billingStatus` SETTLED once any associated service (body dressing)
 *     bill is also settled or doesn't exist — checked both directions
 *     (`settle()` and `settleServiceBilling()`).
 *
 * NOT ported: the source's single hand-written `LEFT JOIN LATERAL` query
 * that fetches each bill's service-bill info in one round trip (a
 * documented performance optimization, not a business rule). Stage C
 * resolves it per-row via `resolveServiceBillFor()` instead — same
 * business result (each bill's associated service bill, real row or the
 * same legacy-aggregate fallback shape), different query shape. Flagged
 * as a deliberate simplification, not a correctness change; a perf pass
 * can reintroduce a single query later if list-view latency becomes an
 * issue at scale.
 */
@Injectable()
export class MortuaryBillingService {
  constructor(
    @InjectRepository(MortuaryBilling)
    private readonly billingRepo: Repository<MortuaryBilling>,
    @Inject(getTenantScopedRepositoryToken(MortuaryBilling))
    private readonly scopedBillingRepo: TenantScopedRepository<MortuaryBilling>,
    @Inject(getTenantScopedRepositoryToken(MortuaryBillingServiceEntity))
    private readonly scopedBillingServiceRepo: TenantScopedRepository<MortuaryBillingServiceEntity>,
    @Inject(getTenantScopedRepositoryToken(MortuaryServiceBilling))
    private readonly scopedServiceBillingRepo: TenantScopedRepository<MortuaryServiceBilling>,
    @InjectRepository(MortuaryServiceMaster)
    private readonly serviceMasterRepo: Repository<MortuaryServiceMaster>,
    @Inject(getTenantScopedRepositoryToken(MortuaryBody))
    private readonly scopedBodyRepo: TenantScopedRepository<MortuaryBody>,
    private readonly settingsService: MortuarySettingsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(tenantId: string, status?: string): Promise<MortuaryBilling[]> {
    return this.scopedBillingRepo.find({
      where: status ? { tenantId, status } : { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findFull(tenantId: string, id: string) {
    const bill = await this.scopedBillingRepo.findOneBy({ id, tenantId });
    if (!bill) throw new NotFoundException('Bill not found');

    const services = await this.scopedBillingServiceRepo.find({ where: { tenantId, billingId: id }, order: { createdAt: 'ASC' } });
    const serviceBill = await this.resolveServiceBillFor(tenantId, id, bill.bodyId, services);

    return { ...bill, services, serviceBill };
  }

  async findByBodyId(tenantId: string, bodyId: string) {
    const bill = await this.scopedBillingRepo.findOneBy({ tenantId, bodyId });
    if (!bill) throw new NotFoundException('Billing not found');
    const services = await this.scopedBillingServiceRepo.find({ where: { tenantId, billingId: bill.id } });
    return { ...bill, services };
  }

  /** Real service_billing row if present; else a legacy aggregate over billing_services, matching source shape exactly. */
  private async resolveServiceBillFor(tenantId: string, billingId: string, bodyId: string, servicesOverride?: MortuaryBillingServiceEntity[]) {
    const real = await this.scopedServiceBillingRepo.findOneBy({ tenantId, billingId });
    if (real) return real;

    const services = servicesOverride ?? (await this.scopedBillingServiceRepo.find({ where: { tenantId, billingId } }));
    if (services.length === 0) return null;

    const charge = services.reduce((sum, s) => sum + Number(s.amount), 0);
    return {
      id: `legacy-${billingId}`,
      bodyId,
      billingId,
      serviceName: services[0].serviceName,
      serviceAmount: charge,
      discountAmount: 0,
      netAmount: charge,
    };
  }

  /**
   * What becomes inconsistent if this isn't atomic: a body could be left
   * with billing_status='GENERATED' but no actual billing row (or vice
   * versa), or a body-dressing service_billing row without its matching
   * billing_services entry — both break every downstream read that
   * assumes those rows exist together.
   */
  async generate(context: MortuaryRequestContext, dto: GenerateMortuaryBillingDto): Promise<{ mortuaryBillId: string; serviceBillId: string | null }> {
    const { tenantId } = context;
    const body = await this.scopedBodyRepo.findOneBy({ id: dto.bodyId, tenantId });
    if (!body) throw new NotFoundException('Body not found');

    const isStaff = dto.staffConcession === true;
    let resolvedDiscountAmount = Number(dto.discountAmount || 0);
    let resolvedDiscountReason = dto.discountReason || null;

    if (isStaff) {
      const discountPct = await this.settingsService.getStaffDiscountPercent(tenantId);
      resolvedDiscountAmount = Number(dto.totalAmount || 0) * (discountPct / 100);
      resolvedDiscountReason = `Staff Welfare Scheme - ${discountPct}% Discount`;
    }

    const resolvedAdvance = dto.advanceAmount !== undefined ? Number(dto.advanceAmount) : 0;
    const resolvedNetAmount = computeNetAmount({ gross: dto.totalAmount, advance: resolvedAdvance, discount: resolvedDiscountAmount });

    const billingId = uuidv4();
    let serviceBillId: string | null = null;

    await this.dataSource.transaction(async (manager) => {
      await manager.insert(MortuaryBilling, {
        id: billingId,
        tenantId,
        bodyId: dto.bodyId,
        cabinAllocationId: dto.cabinAllocationId ?? null,
        totalAmount: dto.totalAmount,
        discountAmount: resolvedDiscountAmount,
        discountReason: resolvedDiscountReason,
        concessionAuthorityId: isStaff ? null : dto.concessionAuthorityId ?? null,
        servicesAmount: 0,
        netAmount: resolvedNetAmount,
        status: 'Pending',
        firstDayCharge: dto.firstDayCharge?.toFixed(2) ?? null,
        extraHours: dto.extraHours ?? null,
        hourlyRate: dto.hourlyRate?.toFixed(2) ?? null,
        additionalHourCharges: dto.additionalHourCharges?.toFixed(2) ?? null,
        totalHours: dto.totalHours ?? null,
        advanceAmount: dto.advanceAmount?.toFixed(2) ?? null,
        staffConcession: isStaff ? 1 : 0,
        staffName: isStaff ? dto.staffName ?? null : null,
        staffEmployeeId: isStaff ? dto.staffEmployeeId ?? null : null,
        staffAddress: isStaff ? dto.staffAddress ?? null : null,
        staffPhone: isStaff ? dto.staffPhone ?? null : null,
        staffRelation: isStaff ? dto.staffRelation ?? null : null,
      });

      if (dto.bodyDressingRequired) {
        serviceBillId = uuidv4();
        const dressingService = await this.serviceMasterRepo.findOne({ where: { tenantId, serviceName: ILike('%dressing%') } });
        const approvedTariff = dressingService ? Number(dressingService.tariff) : 500.0;
        const charge = context.canOverrideBillingCharge ? Number(dto.bodyDressingCharge) || 0 || approvedTariff : approvedTariff;

        await manager.insert(MortuaryServiceBilling, {
          id: serviceBillId,
          tenantId,
          bodyId: dto.bodyId,
          billingId,
          serviceId: dressingService?.id ?? null,
          serviceName: 'Body Dressing',
          serviceAmount: charge.toFixed(2),
          discountAmount: '0.00',
          netAmount: charge.toFixed(2),
          status: 'Pending',
        });
        await manager.insert(MortuaryBillingServiceEntity, {
          id: uuidv4(),
          tenantId,
          billingId,
          serviceId: dressingService?.id ?? null,
          serviceName: 'Body Dressing',
          amount: charge,
        });
      }

      await manager.update(MortuaryBody, { id: dto.bodyId, tenantId }, { billingStatus: 'GENERATED' });
    });

    return { mortuaryBillId: billingId, serviceBillId };
  }

  async settle(tenantId: string, id: string): Promise<MortuaryBilling> {
    const billing = await this.scopedBillingRepo.findOneBy({ id, tenantId });
    if (!billing) throw new NotFoundException('Billing not found');

    await this.dataSource.transaction(async (manager) => {
      await manager.update(MortuaryBilling, { id, tenantId }, { status: 'Settled', settledAt: new Date() });

      const svcBilling = await manager.findOneBy(MortuaryServiceBilling, { tenantId, bodyId: billing.bodyId });
      if (!svcBilling || svcBilling.status === 'Settled') {
        await manager.update(MortuaryBody, { id: billing.bodyId, tenantId }, { billingStatus: 'SETTLED' });
      }
    });

    return this.scopedBillingRepo.findOneBy({ id, tenantId }) as Promise<MortuaryBilling>;
  }

  async findServiceBillingFull(tenantId: string, id: string) {
    if (id.startsWith('legacy-')) {
      const parentBillId = id.replace('legacy-', '');
      const bill = await this.scopedBillingRepo.findOneBy({ id: parentBillId, tenantId });
      if (!bill) throw new NotFoundException('Parent bill not found');
      const services = await this.scopedBillingServiceRepo.find({ where: { tenantId, billingId: parentBillId }, order: { createdAt: 'ASC' } });
      const charge = services.reduce((sum, s) => sum + Number(s.amount), 0);
      return {
        id, bodyId: bill.bodyId, billingId: parentBillId,
        serviceId: services[0]?.serviceId ?? null,
        serviceName: services[0]?.serviceName ?? 'Body Dressing',
        serviceAmount: charge, discountAmount: 0, netAmount: charge,
        status: bill.status, createdAt: bill.createdAt,
      };
    }

    const svcBill = await this.scopedServiceBillingRepo.findOneBy({ id, tenantId });
    if (!svcBill) throw new NotFoundException('Service bill not found');
    return svcBill;
  }

  async settleServiceBilling(tenantId: string, id: string) {
    if (id.startsWith('legacy-')) {
      const parentBillId = id.replace('legacy-', '');
      const parentBill = await this.scopedBillingRepo.findOneBy({ id: parentBillId, tenantId });
      if (!parentBill) throw new NotFoundException('Billing not found');

      await this.dataSource.transaction(async (manager) => {
        await manager.update(MortuaryBilling, { id: parentBillId, tenantId }, { status: 'Settled', settledAt: new Date() });
        await manager.update(MortuaryBody, { id: parentBill.bodyId, tenantId }, { billingStatus: 'SETTLED' });
      });
      return { id, status: 'Settled' };
    }

    const svcBilling = await this.scopedServiceBillingRepo.findOneBy({ id, tenantId });
    if (!svcBilling) throw new NotFoundException('Service billing not found');

    await this.dataSource.transaction(async (manager) => {
      await manager.update(MortuaryServiceBilling, { id, tenantId }, { status: 'Settled' });
      const mortuaryBilling = await manager.findOneBy(MortuaryBilling, { tenantId, bodyId: svcBilling.bodyId });
      if (!mortuaryBilling || mortuaryBilling.status === 'Settled') {
        await manager.update(MortuaryBody, { id: svcBilling.bodyId, tenantId }, { billingStatus: 'SETTLED' });
      }
    });

    return this.scopedServiceBillingRepo.findOneBy({ id, tenantId });
  }
}

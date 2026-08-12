import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MortuaryCabinAllocation } from '../entities/mortuary-cabin-allocation.entity';
import { MortuaryBody } from '../entities/mortuary-body.entity';
import { MortuaryCabin } from '../entities/mortuary-cabin.entity';
import { MortuaryHousekeepingTask } from '../entities/mortuary-housekeeping-task.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { CreateMortuaryAllocationDto, ExtendMortuaryAllocationDto } from '../dto/create-mortuary-allocation.dto';
import { MortuarySettingsService } from './mortuary-settings.service';
import { MortuaryRequestContext } from '../mortuary-request-context';
import { computeStayCharge } from '../utils/billing-math.util';

/**
 * Mortuary integration (Phase 2, Stage C). Ports `allocationController.js`.
 * Tenant-scoped. Business invariants preserved from source (verified
 * against `createAllocation`):
 *
 *  1. Both body and cabin must belong to the caller's tenant (folded into
 *     tenant-scoped lookups here — same effect as source's explicit
 *     `hospital_id` ownership check).
 *  2. A body cannot have more than one active ('Allocated') cabin
 *     allocation at a time.
 *  3. A cabin cannot hold more than one active allocation at a time.
 *  4. An MLC case explicitly marked as NOT requiring a freezer
 *     (`freezerRequired === 0`) cannot be allocated a cabin at all.
 *  5. Advance amount is Admin-policy: only an admin-tier caller may
 *     override the hospital's configured minimum; everyone else's request
 *     silently uses the minimum regardless of what they sent (`isAdmin` on
 *     `MortuaryRequestContext` — see that file's own caveat).
 *  6. Estimated days of stay: allocation-time override if given, else the
 *     body's own recorded `estimatedDaysOfStay`, else a 3-day fallback —
 *     ported in this exact priority order (source comment: the frontend no
 *     longer sends an allocation-time override, so the body's own value is
 *     the real source in practice; 3 is last-resort only).
 */
@Injectable()
export class MortuaryCabinAllocationsService {
  constructor(
    @InjectRepository(MortuaryCabinAllocation)
    private readonly allocationRepo: Repository<MortuaryCabinAllocation>,
    @Inject(getTenantScopedRepositoryToken(MortuaryCabinAllocation))
    private readonly scopedAllocationRepo: TenantScopedRepository<MortuaryCabinAllocation>,
    @Inject(getTenantScopedRepositoryToken(MortuaryBody))
    private readonly scopedBodyRepo: TenantScopedRepository<MortuaryBody>,
    @Inject(getTenantScopedRepositoryToken(MortuaryCabin))
    private readonly scopedCabinRepo: TenantScopedRepository<MortuaryCabin>,
    private readonly settingsService: MortuarySettingsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: string, status?: string): Promise<MortuaryCabinAllocation[]> {
    return this.scopedAllocationRepo.find({
      where: status ? { tenantId, status } : { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * What becomes inconsistent if this isn't atomic: the allocation row
   * could be inserted while the cabin update or body update fails,
   * leaving a cabin marked "Available" that a just-created allocation
   * already claims (double-booking risk) or a body left in "Registered"
   * status despite already holding a cabin.
   */
  async create(context: MortuaryRequestContext, dto: CreateMortuaryAllocationDto): Promise<MortuaryCabinAllocation> {
    const { tenantId } = context;

    const body = await this.scopedBodyRepo.findOneBy({ id: dto.bodyId, tenantId });
    if (!body) throw new NotFoundException('Body not found');
    const cabin = await this.scopedCabinRepo.findOneBy({ id: dto.cabinId, tenantId });
    if (!cabin) throw new NotFoundException('Cabin not found');

    const minimumAdvance = await this.settingsService.getMinimumAdvance(tenantId);
    const parsedAdvance = context.isAdmin ? Number(dto.advanceAmount) || 0 : minimumAdvance;
    if (parsedAdvance < minimumAdvance) {
      throw new BadRequestException(`Advance collection is mandatory and must be at least ₹${minimumAdvance}`);
    }

    const existingBodyAllocation = await this.scopedAllocationRepo.findOneBy({ tenantId, bodyId: dto.bodyId, status: 'Allocated' });
    if (existingBodyAllocation) throw new BadRequestException('Body already has an active cabin allocation');

    const cabinInUse = await this.scopedAllocationRepo.findOneBy({ tenantId, cabinId: dto.cabinId, status: 'Allocated' });
    if (cabinInUse) throw new BadRequestException('This cabin is already occupied by another body');

    if (body.bodyType === 'MLC' && body.freezerRequired === 0) {
      throw new BadRequestException('This MLC case does not require a freezer. Cabin allocation is not applicable.');
    }

    const daysOfStay = dto.estimatedDaysOfStay || body.estimatedDaysOfStay || 3;
    const admissionDateTime = new Date();
    const estimatedReleaseDateTime = new Date(admissionDateTime);
    estimatedReleaseDateTime.setDate(estimatedReleaseDateTime.getDate() + daysOfStay);
    estimatedReleaseDateTime.setHours(23, 59, 0, 0);

    const firstDayCharge = minimumAdvance; // seeds the allocation's stored rate, matching source

    const allocationId = uuidv4();
    await this.dataSource.transaction(async (manager) => {
      await manager.insert(MortuaryCabinAllocation, {
        id: allocationId,
        tenantId,
        bodyId: dto.bodyId,
        cabinId: dto.cabinId,
        admissionDateTime,
        advanceAmount: parsedAdvance,
        hourlyRate: firstDayCharge,
        minHours: 1,
        freeHours: 0,
        estimatedReleaseDateTime,
        status: 'Allocated',
      });
      await manager.update(MortuaryCabin, { id: dto.cabinId, tenantId }, { status: 'Occupied' });
      await manager.update(MortuaryBody, { id: dto.bodyId, tenantId }, { status: 'Allocated' });
    });

    return this.scopedAllocationRepo.findOneBy({ id: allocationId, tenantId }) as Promise<MortuaryCabinAllocation>;
  }

  /**
   * Business rule: release is blocked until the body's bill is fully
   * settled. Atomic for the same reason as `create()` — a cabin update
   * without its matching housekeeping task would leave a cabin that needs
   * cleaning with no cleaning task ever created for it.
   */
  async release(tenantId: string, id: string): Promise<{ releaseDateTime: string }> {
    const allocation = await this.scopedAllocationRepo.findOneBy({ id, tenantId });
    if (!allocation) throw new NotFoundException('Allocation not found');

    const body = await this.scopedBodyRepo.findOneBy({ id: allocation.bodyId, tenantId });
    if (!body || body.billingStatus !== 'SETTLED') {
      throw new BadRequestException('Bill must be settled before release');
    }

    const releaseDateTime = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(MortuaryCabinAllocation, { id, tenantId }, { status: 'Released', releaseDateTime });
      await manager.update(MortuaryCabin, { id: allocation.cabinId, tenantId }, { status: 'NEEDS_CLEANING' });
      await manager.insert(MortuaryHousekeepingTask, {
        id: uuidv4(),
        tenantId,
        cabinId: allocation.cabinId,
        status: 'PENDING',
      });
    });

    return { releaseDateTime: releaseDateTime.toISOString() };
  }

  async extend(tenantId: string, id: string, dto: ExtendMortuaryAllocationDto): Promise<{ estimatedReleaseDateTime: string }> {
    const allocation = await this.scopedAllocationRepo.findOneBy({ id, tenantId });
    if (!allocation) throw new NotFoundException('Allocation not found');

    const estimatedReleaseDateTime = new Date(dto.expectedReleaseDateTime);
    if (Number.isNaN(estimatedReleaseDateTime.getTime())) {
      throw new BadRequestException('expectedReleaseDateTime is not a valid date');
    }
    await this.scopedAllocationRepo.update({ id, tenantId }, { estimatedReleaseDateTime });
    return { estimatedReleaseDateTime: estimatedReleaseDateTime.toISOString() };
  }

  async calculate(tenantId: string, id: string) {
    const allocation = await this.scopedAllocationRepo.findOneBy({ id, tenantId });
    if (!allocation) throw new NotFoundException('Allocation not found');

    const admissionDate = new Date(allocation.admissionDateTime as unknown as string);
    const endDate = allocation.releaseDateTime ? new Date(allocation.releaseDateTime as unknown as string) : new Date();
    const diffMs = endDate.getTime() - admissionDate.getTime();
    const totalHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));

    const settings = await this.settingsService.getOrCreate(tenantId);
    const charge = computeStayCharge(
      {
        pricingModel: settings.pricingModel,
        dailyRate: Number(settings.dailyRate ?? 0),
        firstDayCharge: Number(settings.firstDayCharge),
        hourlyChargeAfter24hrs: Number(settings.hourlyChargeAfter24hrs),
      },
      totalHours,
    );

    const advance = Number(allocation.advanceAmount) || 0;
    const finalAmount = Math.max(0, charge.totalAmount - advance);

    return {
      admissionDateTime: allocation.admissionDateTime,
      currentDateTime: endDate.toISOString(),
      totalHours,
      firstDayCharge: charge.firstDayCharge,
      extraHours: charge.extraHours,
      hourlyRate: charge.hourlyRate,
      additionalHourCharges: charge.additionalHourCharges,
      totalAmount: charge.totalAmount.toFixed(2),
      advanceAmount: advance,
      finalAmount: finalAmount.toFixed(2),
      days: charge.days,
      dailyRate: charge.dailyRate,
    };
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvResource } from './entities/cv-resource.entity';
import { CvResourceBooking } from './entities/cv-resource-booking.entity';

@Injectable()
export class CvResourceManagementService {
  constructor(
    private readonly tenantContext: TenantContextStorage,

    @InjectRepository(CvResource) private readonly resourceWriteRepo: Repository<CvResource>,
    @InjectRepository(CvResourceBooking) private readonly bookingWriteRepo: Repository<CvResourceBooking>,

    @Inject(getTenantScopedRepositoryToken(CvResource)) private readonly resourceReadRepo: TenantScopedRepository<CvResource>,
    @Inject(getTenantScopedRepositoryToken(CvResourceBooking)) private readonly bookingReadRepo: TenantScopedRepository<CvResourceBooking>,
  ) {}

  async createResource(payload: Partial<CvResource>) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const resource = this.resourceWriteRepo.create({
      tenantId,
      ...payload,
      lifecycleState: { purchasedAt: new Date().toISOString() }
    });

    return this.resourceWriteRepo.save(resource);
  }

  async bookResource(resourceId: string, bookedBy: string, startTime: Date, endTime: Date) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const resource = await this.resourceReadRepo.findOne({ where: { id: resourceId } });
    if (!resource || resource.status !== 'AVAILABLE') throw new Error('Resource not available');

    const booking = this.bookingWriteRepo.create({
      tenantId,
      resourceId,
      bookedBy,
      startTime,
      endTime,
      status: 'CONFIRMED'
    });

    return this.bookingWriteRepo.save(booking);
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvCalendarEvent } from './entities/cv-calendar-event.entity';

@Injectable()
export class CvCalendarEventService {
  constructor(
    private readonly tenantContext: TenantContextStorage,

    @InjectRepository(CvCalendarEvent) private readonly calendarWriteRepo: Repository<CvCalendarEvent>,
    @Inject(getTenantScopedRepositoryToken(CvCalendarEvent)) private readonly calendarReadRepo: TenantScopedRepository<CvCalendarEvent>,
  ) {}

  async createCalendarEvent(academicYearId: string, payload: Partial<CvCalendarEvent>) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const event = this.calendarWriteRepo.create({
      tenantId,
      academicYearId,
      ...payload
    });

    return this.calendarWriteRepo.save(event);
  }

  async getEventsForYear(academicYearId: string) {
    return this.calendarReadRepo.find({
      where: { academicYearId },
      order: { startDate: 'ASC' }
    });
  }
}

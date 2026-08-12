import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvReport } from './entities/cv-report.entity';
import { CvExportService } from './cv-export.service';

@Injectable()
export class CvReportingService {
  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,
    private readonly exportService: CvExportService,

    // Write Repositories
    @InjectRepository(CvReport) private readonly reportWriteRepo: Repository<CvReport>,

    // Read Repositories (Tenant Scoped)
    @Inject(getTenantScopedRepositoryToken(CvReport)) private readonly reportReadRepo: TenantScopedRepository<CvReport>,
  ) {}

  async createSavedReport(actorId: string, data: Partial<CvReport>) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const report = this.reportWriteRepo.create({ ...data, tenantId, createdBy: actorId });
    const saved = await this.reportWriteRepo.save(report);
    
    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CREATE_SAVED_REPORT',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_reports',
      metadata: { type: saved.type },
    });
    return saved;
  }

  async getSavedReports() {
    return this.reportReadRepo.find({ order: { name: 'ASC' } });
  }

  async executeReport(actorId: string, reportId: string, runtimeFilters?: any) {
    const report = await this.reportReadRepo.findOne({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    // In a real application, this would dynamically build QueryBuilder statements
    // based on report.config and runtimeFilters.
    // For Milestone 1, we return simulated aggregated data depending on the type.

    let data: any[] = [];
    if (report.type === 'CLASS_REGISTER') {
      data = [{ student: 'Leo M.', attendance: '95%', iep: 'Active', behaviour: 'Stable' }];
    } else if (report.type === 'STUDENT_PROGRESS') {
      data = [{ objective: 'MATH-1.1', status: 'Achieved', date: '2026-08-01' }];
    }

    return {
      reportDef: report,
      filtersApplied: { ...report.config, ...runtimeFilters },
      data,
    };
  }

  async exportReport(actorId: string, reportId: string, format: string) {
    // Generate data, then queue export
    const result = await this.executeReport(actorId, reportId);
    return this.exportService.queueExport(actorId, format, reportId, result);
  }
}

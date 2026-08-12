import { Injectable, Logger } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvReportExport } from './entities/cv-report-export.entity';

@Injectable()
export class CvExportService {
  private readonly logger = new Logger(CvExportService.name);

  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,
    @InjectRepository(CvReportExport) private readonly exportWriteRepo: Repository<CvReportExport>,
  ) {}

  async queueExport(actorId: string, format: string, reportId?: string, payload?: any) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const exp = this.exportWriteRepo.create({
      tenantId,
      reportId: reportId || null,
      format,
      status: 'PENDING',
      requestedBy: actorId,
    });
    
    const saved = await this.exportWriteRepo.save(exp);

    // In a real application, this would dispatch to a BullMQ worker.
    // For Milestone 1, we will simulate synchronous/fast processing.
    this.processExportMock(saved, payload);

    return saved;
  }

  private async processExportMock(exportRecord: CvReportExport, payload: any) {
    try {
      this.logger.log(`Processing ${exportRecord.format} export ${exportRecord.id}`);
      
      // Simulate rendering PDF/CSV/Excel
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update status
      exportRecord.status = 'COMPLETED';
      exportRecord.fileUrl = `/downloads/${exportRecord.tenantId}/${exportRecord.format.toLowerCase()}_${exportRecord.id}.${exportRecord.format.toLowerCase()}`;
      await this.exportWriteRepo.save(exportRecord);

    } catch (e) {
      exportRecord.status = 'FAILED';
      await this.exportWriteRepo.save(exportRecord);
      this.logger.error(`Export failed: ${e}`);
    }
  }
}

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvSettings } from './entities/cv-settings.entity';
import { UpdateCvSettingsDto } from './dto/update-cv-settings.dto';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class CvSettingsService {
  private readonly logger = new Logger(CvSettingsService.name);

  constructor(
    @InjectRepository(CvSettings)
    private readonly settingsRepo: Repository<CvSettings>,
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Get-or-create per tenant, rather than a migration-seeded singleton row
   * (contrast FeedbackSettings' `INSERT ... DEFAULT VALUES` migration) --
   * that approach would need re-running for every tenant provisioned after
   * this feature ships, which a migration can't do. Lazily creating the row
   * on first read means a brand-new tenant just gets the column defaults
   * (`requireAdmissionApproval: false`) with zero extra provisioning step.
   */
  async get(tenantId: string): Promise<CvSettings> {
    let row = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!row) {
      row = await this.settingsRepo.save(this.settingsRepo.create({ tenantId }));
    }
    return row;
  }

  async getForCurrentTenant(): Promise<CvSettings> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required to read Children\'s Village settings');
    }
    return this.get(tenantId);
  }

  async update(patch: UpdateCvSettingsDto, actorId: string): Promise<CvSettings> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required to update Children\'s Village settings');
    }

    const current = await this.get(tenantId);
    Object.assign(current, patch);
    current.updatedBy = actorId;
    const saved = await this.settingsRepo.save(current);

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_SETTINGS_UPDATED',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_settings',
      metadata: { requireAdmissionApproval: saved.requireAdmissionApproval },
    });

    return saved;
  }

  /**
   * Convenience used by CvAdmissionsService -- isolates the one boolean it
   * actually needs from the rest of this settings surface, so that service
   * doesn't have to know the shape of CvSettings.
   */
  async isAdmissionApprovalRequired(tenantId: string): Promise<boolean> {
    const row = await this.get(tenantId);
    return row.requireAdmissionApproval;
  }
}

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvAlert } from './entities/cv-alert.entity';

@Injectable()
export class CvNotificationService {
  constructor(
    private readonly tenantContext: TenantContextStorage,

    @InjectRepository(CvAlert) private readonly alertWriteRepo: Repository<CvAlert>,
    @Inject(getTenantScopedRepositoryToken(CvAlert)) private readonly alertReadRepo: TenantScopedRepository<CvAlert>,
  ) {}

  async evaluateRulesAndGenerateAlerts() {
    // In a real application, this is triggered by Cron or specific events (like DLR submit).
    // It scans for conditions like:
    // - IEPs with nextReview date < Date.now()
    // - Students with > 3 days of consecutive absences
    // - Behaviour incidents marked as severe
  }

  async triggerAlert(type: string, severity: string, message: string, studentId?: string, metadata?: any) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) return;

    const alert = this.alertWriteRepo.create({
      tenantId,
      studentId: studentId || null,
      type,
      severity,
      message,
      metadata,
    });
    
    return this.alertWriteRepo.save(alert);
  }

  async escalateToPlatform(alertId: string) {
    // Escalate the local cv_alerts record to the global HDSP Notifications module
    // which handles Email, SMS, and Push Notifications.
    const alert = await this.alertReadRepo.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Alert not found');

    alert.status = 'ESCALATED';
    // Logic to push to Platform Notification Service would go here
    
    await this.alertWriteRepo.save(alert);
    return alert;
  }

  async dismissAlert(actorId: string, alertId: string) {
    const alert = await this.alertReadRepo.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Alert not found');

    alert.status = 'DISMISSED';
    alert.actionedBy = actorId;
    alert.actionedAt = new Date();
    
    return this.alertWriteRepo.save(alert);
  }
}

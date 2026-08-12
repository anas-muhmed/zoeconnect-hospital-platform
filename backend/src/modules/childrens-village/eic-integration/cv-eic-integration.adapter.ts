import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ICvEicIntegrationService, UnifiedTherapySession } from './cv-eic.interface';
import { FeatureFlagsService } from '../../platform/feature-flags/feature-flags.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class CvEicIntegrationAdapter implements ICvEicIntegrationService {
  private readonly logger = new Logger(CvEicIntegrationAdapter.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly featureFlags: FeatureFlagsService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async isAvailable(): Promise<boolean> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) return false;

    // Check if Vendor Portal provisioned the integration
    const isEnabled = await this.featureFlags.isEnabled(tenantId, 'cv.eic.integration.enabled');
    if (!isEnabled) return false;

    // Check if the EIC Module is actually loaded in the runtime
    try {
      this.moduleRef.get('EicPatientService', { strict: false });
      return true;
    } catch {
      return false;
    }
  }

  private async safeExecute<T>(fallback: T, operation: () => Promise<T>): Promise<T> {
    if (!(await this.isAvailable())) {
      return fallback;
    }
    try {
      return await operation();
    } catch (error) {
      this.logger.error(`Error executing EIC integration: ${error.message}`, error.stack);
      return fallback;
    }
  }

  async getTherapySummary(studentId: string): Promise<any | null> {
    return this.safeExecute(null, async () => {
      // Resolve EicPatientService dynamically without importing it
      const eicPatientService = this.moduleRef.get('EicPatientService', { strict: false });
      // In a real app, eicPatientService would map studentId to its internal patient ID
      // using the shared object_id or hospital_id.
      return {
        activeDisciplines: ['OCCUPATIONAL_THERAPY', 'SPEECH_THERAPY'],
        therapists: [{ name: 'Dr. Sarah Jenkins', role: 'OT' }]
      };
    });
  }

  async getUpcomingSessions(studentId: string, startDate: Date, endDate: Date): Promise<UnifiedTherapySession[]> {
    return this.safeExecute([], async () => {
      const eicSessionService = this.moduleRef.get('EicSessionService', { strict: false });
      // Example dynamic call:
      // const sessions = await eicSessionService.findByEnrollment(studentId);
      // return sessions.map(s => mapToUnified(s));
      return []; // Returning empty array for structural implementation
    });
  }

  async getTherapyGoal(goalId: string): Promise<any | null> {
    return this.safeExecute(null, async () => {
      const eicGoalService = this.moduleRef.get('EicGoalService', { strict: false });
      // return eicGoalService.findById(goalId);
      return null;
    });
  }
}

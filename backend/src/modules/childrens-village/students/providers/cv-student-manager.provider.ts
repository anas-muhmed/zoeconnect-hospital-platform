import { Injectable } from '@nestjs/common';
import { CVStudentProvider, UnifiedStudent, ListStudentsParams, ListStudentsResult } from '../interfaces/cv-student.interface';
import { FeatureFlagsService } from '../../../platform/feature-flags/feature-flags.service';
import { TenantContextStorage } from '../../../platform/tenant/context/tenant-context-storage';
import { OracleHisStudentProvider } from './oracle-his-student.provider';
import { InternalStudentProvider } from './internal-student.provider';

@Injectable()
export class CVStudentProviderManager implements CVStudentProvider {
  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly featureFlags: FeatureFlagsService,
    private readonly oracle: OracleHisStudentProvider,
    private readonly internal: InternalStudentProvider,
  ) {}

  /**
   * Resolves the active CVStudentProvider adapter from the provisioned tenant configuration.
   * This is explicitly managed via the Vendor Portal syncing feature flags.
   */
  private async getAdapter(): Promise<CVStudentProvider> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const useInternal = await this.featureFlags.isEnabled(tenantId, 'cv.student.provider.internal');
    
    return useInternal ? this.internal : this.oracle;
  }

  async searchStudents(query: string): Promise<UnifiedStudent[]> {
    const adapter = await this.getAdapter();
    return adapter.searchStudents(query);
  }

  async listStudents(params: ListStudentsParams): Promise<ListStudentsResult> {
    const adapter = await this.getAdapter();
    return adapter.listStudents(params);
  }

  async getStudentById(id: string): Promise<UnifiedStudent | null> {
    const adapter = await this.getAdapter();
    return adapter.getStudentById(id);
  }

  async createStudent(data: Partial<UnifiedStudent>): Promise<UnifiedStudent> {
    const adapter = await this.getAdapter();
    return adapter.createStudent(data);
  }

  async updateStudent(id: string, data: Partial<UnifiedStudent>): Promise<UnifiedStudent> {
    const adapter = await this.getAdapter();
    return adapter.updateStudent(id, data);
  }
}

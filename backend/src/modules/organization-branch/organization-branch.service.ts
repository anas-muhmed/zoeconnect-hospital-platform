import {
  Injectable, Logger, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrganizationBranch } from './entities/organization-branch.entity';
import { CreateOrganizationBranchDto } from './dto/create-organization-branch.dto';
import { UpdateOrganizationBranchDto } from './dto/update-organization-branch.dto';

/**
 * ZoeConnect Identity Architecture Migration, Phase 1 (additive-only).
 *
 * Manages `organization_branches` rows -- the new, ZoeConnect-native branch
 * concept used only when Oracle HIS is not connected for a tenant. See
 * organization-branch.entity.ts's doc comment for the full "this is NOT the
 * HIS Branch flow" explanation; this service must never be wired into
 * `BranchService`'s Oracle-querying path.
 */
@Injectable()
export class OrganizationBranchService {
  private readonly logger = new Logger(OrganizationBranchService.name);

  constructor(
    @InjectRepository(OrganizationBranch) private readonly repo: Repository<OrganizationBranch>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listForTenant(tenantId: string): Promise<OrganizationBranch[]> {
    return this.repo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async findOne(tenantId: string, id: string): Promise<OrganizationBranch> {
    const branch = await this.repo.findOne({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException(`Organization branch ${id} not found`);
    return branch;
  }

  /**
   * Returns the tenant's single `is_default = true` row. Throws if none
   * exists -- every tenant is expected to have exactly one default branch
   * from the moment it is provisioned (see
   * TenantProvisioningService.stepCreateDefaultOrgBranch()); a missing
   * default indicates a data-integrity gap worth surfacing loudly rather
   * than silently returning null to a caller expecting a real branch.
   */
  async getDefault(tenantId: string): Promise<OrganizationBranch> {
    const branch = await this.repo.findOne({ where: { tenantId, isDefault: true } });
    if (!branch) {
      throw new NotFoundException(`Tenant ${tenantId} has no default organization branch`);
    }
    return branch;
  }

  async create(tenantId: string, dto: CreateOrganizationBranchDto): Promise<OrganizationBranch> {
    const existing = await this.repo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) {
      throw new ConflictException(`Organization branch code '${dto.code}' already exists for this tenant`);
    }

    if (dto.isDefault) {
      return this.dataSource.transaction(async (em) => {
        await em.getRepository(OrganizationBranch).update(
          { tenantId, isDefault: true },
          { isDefault: false },
        );
        const created = em.getRepository(OrganizationBranch).create({
          tenantId,
          name: dto.name,
          code: dto.code,
          isDefault: true,
          status: dto.status ?? 'active',
        });
        return em.getRepository(OrganizationBranch).save(created);
      });
    }

    const created = this.repo.create({
      tenantId,
      name: dto.name,
      code: dto.code,
      isDefault: false,
      status: dto.status ?? 'active',
    });
    return this.repo.save(created);
  }

  async update(tenantId: string, id: string, dto: UpdateOrganizationBranchDto): Promise<OrganizationBranch> {
    const branch = await this.findOne(tenantId, id);

    if (dto.isDefault === true && !branch.isDefault) {
      return this.dataSource.transaction(async (em) => {
        await em.getRepository(OrganizationBranch).update(
          { tenantId, isDefault: true },
          { isDefault: false },
        );
        if (dto.name !== undefined) branch.name = dto.name;
        if (dto.status !== undefined) branch.status = dto.status;
        branch.isDefault = true;
        return em.getRepository(OrganizationBranch).save(branch);
      });
    }

    if (dto.name !== undefined) branch.name = dto.name;
    if (dto.status !== undefined) branch.status = dto.status;
    if (dto.isDefault === false) branch.isDefault = false;
    return this.repo.save(branch);
  }

  /**
   * Creates the one default branch for a brand-new tenant. Idempotent: if a
   * default already exists (e.g. a resumed provisioning run), returns it
   * unchanged rather than creating a duplicate -- matches this codebase's
   * established resume-safety convention (see
   * TenantProvisioningService.stepIssueTrialLicense()'s VendorRegistration
   * reuse for the same pattern).
   */
  async ensureDefaultForTenant(tenantId: string, tenantName: string): Promise<OrganizationBranch> {
    const existing = await this.repo.findOne({ where: { tenantId, isDefault: true } });
    if (existing) return existing;

    try {
      const created = this.repo.create({
        tenantId,
        name: 'Main Branch',
        code: 'main',
        isDefault: true,
        status: 'active',
      });
      return await this.repo.save(created);
    } catch (err: any) {
      // Race/resume safety: a concurrent call or a re-run that slipped past
      // the existence check above hits the (tenant_id, code) unique
      // constraint instead -- treat that as "already provisioned" rather
      // than a hard failure.
      if (err?.code === '23505') {
        const raced = await this.repo.findOne({ where: { tenantId, code: 'main' } });
        if (raced) return raced;
      }
      throw err;
    }
  }
}

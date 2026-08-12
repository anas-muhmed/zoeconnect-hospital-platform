import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentCategory } from '../entities/incident-category.entity';
import { IncidentType } from '../entities/incident-type.entity';
import { IncidentSeverityLevel } from '../entities/incident-severity-level.entity';
import { IncidentPriorityLevel } from '../entities/incident-priority-level.entity';
import { IncidentRiskMatrixConfig } from '../entities/incident-risk-matrix-config.entity';
import { IncidentNotificationRole } from '../entities/incident-notification-role.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateTypeDto, UpdateTypeDto,
  CreateSeverityDto,
  UpdateRiskMatrixCellDto,
  CreateNotificationRoleDto, UpdateNotificationRoleDto,
} from '../dto/incident-settings.dto';

/**
 * IncidentSettingsService — admin configuration for all configurable
 * incident module settings. Zero hardcoded values.
 *
 * All settings are tenant-scoped. Global defaults (tenant_id = NULL)
 * are used as fallbacks when no tenant-specific override exists.
 */
@Injectable()
export class IncidentSettingsService {
  private readonly logger = new Logger(IncidentSettingsService.name);

  constructor(
    @InjectRepository(IncidentCategory)       private readonly catRepo:      Repository<IncidentCategory>,
    @InjectRepository(IncidentType)           private readonly typeRepo:     Repository<IncidentType>,
    @InjectRepository(IncidentSeverityLevel)  private readonly sevRepo:      Repository<IncidentSeverityLevel>,
    @InjectRepository(IncidentPriorityLevel)  private readonly priRepo:      Repository<IncidentPriorityLevel>,
    @InjectRepository(IncidentRiskMatrixConfig) private readonly riskRepo:   Repository<IncidentRiskMatrixConfig>,
    @InjectRepository(IncidentNotificationRole) private readonly notifRoleRepo: Repository<IncidentNotificationRole>,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // ── Categories ────────────────────────────────────────────────────────────

  async getCategories(): Promise<IncidentCategory[]> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const tenant = await this.catRepo.find({ where: { tenantId, isActive: true } as any, order: { displayOrder: 'ASC' } });
    if (tenant.length > 0) return tenant;
    return this.catRepo.find({ where: { tenantId: null, isActive: true } as any, order: { displayOrder: 'ASC' } });
  }

  async createCategory(dto: CreateCategoryDto): Promise<IncidentCategory> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const cat = this.catRepo.create({ ...dto, tenantId });
    return this.catRepo.save(cat);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<IncidentCategory> {
    await this.catRepo.update(id, dto);
    return this.catRepo.findOneOrFail({ where: { id } });
  }

  // ── Types ─────────────────────────────────────────────────────────────────

  async getTypes(categoryId?: string): Promise<IncidentType[]> {
    const where: any = { isActive: true };
    if (categoryId) where.categoryId = categoryId;
    return this.typeRepo.find({ where, order: { displayOrder: 'ASC' }, relations: ['category'] });
  }

  async createType(dto: CreateTypeDto): Promise<IncidentType> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const type = this.typeRepo.create({ ...dto, tenantId });
    return this.typeRepo.save(type);
  }

  async updateType(id: string, dto: UpdateTypeDto): Promise<IncidentType> {
    await this.typeRepo.update(id, dto);
    return this.typeRepo.findOneOrFail({ where: { id } });
  }

  // ── Severity ──────────────────────────────────────────────────────────────

  async getSeverityLevels(): Promise<IncidentSeverityLevel[]> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const tenant = await this.sevRepo.find({ where: { tenantId, isActive: true } as any, order: { displayOrder: 'ASC' } });
    if (tenant.length > 0) return tenant;
    return this.sevRepo.find({ where: { tenantId: null, isActive: true } as any, order: { displayOrder: 'ASC' } });
  }

  async createSeverity(dto: CreateSeverityDto): Promise<IncidentSeverityLevel> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const sev = this.sevRepo.create({ ...dto, tenantId });
    return this.sevRepo.save(sev);
  }

  async updateSeverity(id: string, dto: Partial<CreateSeverityDto>): Promise<IncidentSeverityLevel> {
    await this.sevRepo.update(id, dto);
    return this.sevRepo.findOneOrFail({ where: { id } });
  }

  // ── Priority ──────────────────────────────────────────────────────────────

  async getPriorityLevels(): Promise<IncidentPriorityLevel[]> {
    return this.priRepo.find({ where: { isActive: true }, order: { displayOrder: 'ASC' } });
  }

  // ── Risk Matrix ───────────────────────────────────────────────────────────

  async getRiskMatrix(): Promise<IncidentRiskMatrixConfig[]> {
    return this.riskRepo.find({ order: { likelihood: 'ASC', impact: 'ASC' } });
  }

  async updateRiskMatrixCell(dto: UpdateRiskMatrixCellDto): Promise<IncidentRiskMatrixConfig> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const existing = await this.riskRepo.findOne({
      where: { likelihood: dto.likelihood, impact: dto.impact, tenantId } as any,
    });

    if (existing) {
      await this.riskRepo.update(existing.id, { riskLevel: dto.riskLevel, color: dto.color ?? existing.color });
      return this.riskRepo.findOneOrFail({ where: { id: existing.id } });
    }

    // Create tenant override cell
    const cell = this.riskRepo.create({
      tenantId,
      likelihood: dto.likelihood,
      impact: dto.impact,
      riskLevel: dto.riskLevel,
      color: dto.color ?? '#F59E0B',
    });
    return this.riskRepo.save(cell);
  }

  // ── Notification Roles (incident-scoped, distinct from platform RBAC) ───────
  //
  // These back the free-text `notifyRoles` values on Severity Levels and
  // Notification Rules. Kept entirely inside the incident module rather
  // than platform RBAC so incident admins can manage "who is the risk
  // manager right now" without touching login/permission roles.

  async getNotificationRoles(): Promise<(IncidentNotificationRole & { memberCount: number })[]> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const tenant = await this.notifRoleRepo.find({ where: { tenantId, isActive: true } as any, order: { displayOrder: 'ASC' } });
    const roles = tenant.length > 0
      ? tenant
      : await this.notifRoleRepo.find({ where: { tenantId: null, isActive: true } as any, order: { displayOrder: 'ASC' } });

    return this.withMemberCounts(roles);
  }

  /** Attaches a `memberCount` to each role via a single grouped query (no N+1). */
  private async withMemberCounts(roles: IncidentNotificationRole[]): Promise<(IncidentNotificationRole & { memberCount: number })[]> {
    if (roles.length === 0) return [];

    const counts: { notification_role_id: string; count: number }[] = await this.notifRoleRepo.manager.query(
      `SELECT notification_role_id, COUNT(*)::int AS count
       FROM incident_notification_role_members
       WHERE notification_role_id = ANY($1)
       GROUP BY notification_role_id`,
      [roles.map((r) => r.id)],
    );
    const countMap = new Map(counts.map((c) => [c.notification_role_id, Number(c.count)]));

    return roles.map((r) => ({ ...r, memberCount: countMap.get(r.id) ?? 0 }));
  }

  async createNotificationRole(dto: CreateNotificationRoleDto): Promise<IncidentNotificationRole> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const role = this.notifRoleRepo.create({ ...dto, tenantId });
    return this.notifRoleRepo.save(role);
  }

  async updateNotificationRole(id: string, dto: UpdateNotificationRoleDto): Promise<IncidentNotificationRole> {
    await this.notifRoleRepo.update(id, dto);
    return this.notifRoleRepo.findOneOrFail({ where: { id } });
  }

  async getNotificationRoleMembers(roleId: string): Promise<{ id: string; username: string; email: string; fullName: string | null }[]> {
    const role = await this.notifRoleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Notification role ${roleId} not found`);
    return this.notifRoleRepo.manager.query(
      `SELECT u.id, u.username, u.email, u.full_name AS "fullName"
       FROM incident_notification_role_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.notification_role_id = $1
       ORDER BY u.full_name NULLS LAST, u.username`,
      [roleId],
    );
  }

  async addNotificationRoleMember(roleId: string, userId: string): Promise<void> {
    const role = await this.notifRoleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Notification role ${roleId} not found`);
    const user = await this.notifRoleRepo.manager.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!user.length) throw new NotFoundException(`User ${userId} not found`);
    await this.notifRoleRepo.manager.query(
      `INSERT INTO incident_notification_role_members (notification_role_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roleId, userId],
    );
  }

  async removeNotificationRoleMember(roleId: string, userId: string): Promise<void> {
    await this.notifRoleRepo.manager.query(
      `DELETE FROM incident_notification_role_members WHERE notification_role_id = $1 AND user_id = $2`,
      [roleId, userId],
    );
  }

  /** Full settings bundle for frontend initial load */
  async getAllSettings() {
    const [categories, severityLevels, priorityLevels, riskMatrix] = await Promise.all([
      this.getCategories(),
      this.getSeverityLevels(),
      this.getPriorityLevels(),
      this.getRiskMatrix(),
    ]);
    return { categories, severityLevels, priorityLevels, riskMatrix };
  }
}

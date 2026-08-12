import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { TokenBranchConfig, TokenMode } from '../entities/token-branch-config.entity';
import { TokenKioskBranding, FontSizeMode } from '../entities/token-kiosk-branding.entity';
import { TokenScConfig } from '../entities/token-sc-config.entity';
import { TokenAuditService } from '../audit/token-audit.service';
import { InjectRedis } from '../../../common/redis/redis.provider';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/** Returned when there are active operators and force=false */
export interface ModeSwitchWarning {
  warning:         true;
  activeOperators: number;
  message:         string;
}

export interface UpdateModeDto {
  mode:           TokenMode;
  dailyResetTime?: string;
  timezone?:       string;
}

export interface UpdateBrandingDto {
  hospitalName?:   string;
  logoUrl?:        string;
  primaryColor?:   string;
  secondaryColor?: string;
  backgroundUrl?:  string;
  welcomeMessage?: Record<string, string>;
  availableLangs?: string[];
  fontSizeMode?:   FontSizeMode;
  footerText?:     string;
}

export interface UpsertScConfigDto {
  departmentId:       string;
  departmentName:     string;
  serviceCenterId:    string;
  serviceCenterName:  string;
  intrabranchId?:     string;
  tokenPrefix?:       string;
  startNumber?:       number;
  maxNumber?:         number;
  resetDaily?:        boolean;
}

@Injectable()
export class TokenConfigService {
  constructor(
    @InjectRepository(TokenBranchConfig)
    private readonly configRepo: Repository<TokenBranchConfig>,

    @InjectRepository(TokenKioskBranding)
    private readonly brandingRepo: Repository<TokenKioskBranding>,

    @InjectRepository(TokenScConfig)
    private readonly scConfigRepo: Repository<TokenScConfig>,

    private readonly auditService: TokenAuditService,

    @InjectRedis()
    private readonly redis: Redis,

    /**
     * Stage B (Checkpoint B3.8) — scoped repositories for `getBranchConfig()`
     * (and its `getMode()` delegate) and `listScConfigs()` only, both
     * session-resolved-only. `getBranding()` stays raw — shared with the
     * `@Public() GET branding` route. `upsertScConfig()`/`deactivateScConfig()`/
     * `getScConfigById()`'s inline reads stay raw too, per this checkpoint's
     * narrower cut (one-off inline reads embedded in write methods, not
     * separately-named shared helpers).
     */
    @Inject(getTenantScopedRepositoryToken(TokenBranchConfig))
    private readonly scopedConfigRepo: TenantScopedRepository<TokenBranchConfig>,
    @Inject(getTenantScopedRepositoryToken(TokenScConfig))
    private readonly scopedScConfigRepo: TenantScopedRepository<TokenScConfig>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // -- Branch mode ------------------------------------------------------------

  /**
   * Count active operator sessions by scanning token:session:* keys.
   * In a single-branch deployment all sessions belong to the same branch,
   * so a non-zero count means the branch has active operators.
   */
  async countActiveOperators(): Promise<number> {
    let count = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor, 'MATCH', 'token:session:*', 'COUNT', 200,
      );
      cursor = next;
      count += keys.length;
    } while (cursor !== '0');
    return count;
  }

  private static readonly CONFIG_SELECT = [
    'id', 'branchId', 'mode', 'dailyResetTime', 'timezone', 'createdAt', 'updatedAt', 'updatedBy',
  ] as const;

  // A5.5 API Contract Audit: admin GET token/config -- explicit select excludes tenantId.
  async getBranchConfig(branchId: string): Promise<TokenBranchConfig> {
    let config = await this.scopedConfigRepo.findOne({
      where: { branchId },
      select: [...TokenConfigService.CONFIG_SELECT],
    });
    if (!config) {
      // Auto-create with defaults on first access
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      config = await this.configRepo.save(
        this.configRepo.create({ branchId, mode: 'LOCATION_BASED', tenantId }),
      );
      delete (config as { tenantId?: string | null }).tenantId;
    }
    return config;
  }

  async getMode(branchId: string): Promise<TokenMode> {
    const config = await this.getBranchConfig(branchId);
    return config.mode;
  }

  /**
   * Update the branch token mode.
   *
   * GAP-18: If there are active operator sessions and force is not set,
   * returns a ModeSwitchWarning instead of applying the change.
   * Pass force=true to override and switch mode while operators are active.
   */
  async updateMode(
    branchId: string,
    dto: UpdateModeDto,
    updatedBy: string,
    force = false,
  ): Promise<TokenBranchConfig | ModeSwitchWarning> {
    // Active-operator guard
    if (!force) {
      const activeOperators = await this.countActiveOperators();
      if (activeOperators > 0) {
        return {
          warning: true,
          activeOperators,
          message:
            `${activeOperators} operator(s) currently active. ` +
            'Pass ?force=true to switch mode anyway.',
        };
      }
    }

    const config = await this.getBranchConfig(branchId);
    const before = { ...config };

    config.mode = dto.mode;
    if (dto.dailyResetTime) config.dailyResetTime = dto.dailyResetTime;
    if (dto.timezone)       config.timezone       = dto.timezone;
    config.updatedBy = updatedBy;

    const saved = await this.configRepo.save(config);

    await this.auditService.log({
      branchId,
      entityType:  'token_branch_config',
      entityId:    saved.id,
      action:      'UPDATE',
      changedBy:   updatedBy,
      beforeState: before as Record<string, unknown>,
      afterState:  saved   as unknown as Record<string, unknown>,
    });

    return saved;
  }

  // -- Branding ---------------------------------------------------------------

  private static readonly BRANDING_SELECT = [
    'id', 'branchId', 'hospitalName', 'logoUrl', 'primaryColor', 'secondaryColor',
    'backgroundUrl', 'welcomeMessage', 'availableLangs', 'fontSizeMode', 'footerText',
    'updatedAt', 'updatedBy',
  ] as const;

  // A5.5 API Contract Audit: reached from @Public() GET token/config/branding
  // (anonymous kiosk/display branding lookup) -- explicit select excludes
  // tenantId from what unauthenticated traffic receives.
  async getBranding(branchId: string): Promise<TokenKioskBranding> {
    let branding = await this.brandingRepo.findOne({
      where: { branchId },
      select: [...TokenConfigService.BRANDING_SELECT],
    });
    if (!branding) {
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      branding = await this.brandingRepo.save(
        this.brandingRepo.create({ branchId, tenantId }),
      );
      delete (branding as { tenantId?: string | null }).tenantId;
    }
    return branding;
  }

  async updateBranding(
    branchId: string,
    dto: UpdateBrandingDto,
    updatedBy: string,
  ): Promise<TokenKioskBranding> {
    const branding = await this.getBranding(branchId);
    const before = { ...branding };

    if (dto.hospitalName   !== undefined) branding.hospitalName   = dto.hospitalName;
    if (dto.logoUrl        !== undefined) branding.logoUrl        = dto.logoUrl;
    if (dto.primaryColor   !== undefined) branding.primaryColor   = dto.primaryColor;
    if (dto.secondaryColor !== undefined) branding.secondaryColor = dto.secondaryColor;
    if (dto.backgroundUrl  !== undefined) branding.backgroundUrl  = dto.backgroundUrl;
    if (dto.welcomeMessage !== undefined) branding.welcomeMessage = dto.welcomeMessage;
    if (dto.availableLangs !== undefined) branding.availableLangs = dto.availableLangs;
    if (dto.fontSizeMode   !== undefined) branding.fontSizeMode   = dto.fontSizeMode;
    if (dto.footerText     !== undefined) branding.footerText     = dto.footerText;
    branding.updatedBy = updatedBy;

    const saved = await this.brandingRepo.save(branding);

    await this.auditService.log({
      branchId,
      entityType:  'token_kiosk_branding',
      entityId:    saved.id,
      action:      'UPDATE',
      changedBy:   updatedBy,
      beforeState: before as Record<string, unknown>,
      afterState:  saved  as unknown as Record<string, unknown>,
    });

    return saved;
  }

  // -- SC Configs (HIS-based mode) --------------------------------------------

  // A5.5 API Contract Audit: admin GET token/config/sc-configs -- explicit select excludes tenantId.
  async listScConfigs(branchId: string): Promise<TokenScConfig[]> {
    return this.scopedScConfigRepo.find({
      where: { branchId },
      order: { departmentName: 'ASC', serviceCenterName: 'ASC' },
      select: [
        'id', 'branchId', 'departmentId', 'departmentName', 'serviceCenterId',
        'serviceCenterName', 'intrabranchId', 'tokenPrefix', 'startNumber',
        'maxNumber', 'resetDaily', 'isActive', 'createdAt', 'updatedAt',
      ],
    });
  }

  async upsertScConfig(
    branchId: string,
    dto: UpsertScConfigDto,
    updatedBy: string,
  ): Promise<TokenScConfig> {
    let config = await this.scConfigRepo.findOne({
      where: { branchId, serviceCenterId: dto.serviceCenterId },
    });

    const isNew = !config;
    const before = config ? { ...config } : null;

    if (!config) {
      // Fail-fast, not currentTenantIdOrNull() — see
      // TenantContextStorage.requireTenantContext()'s doc comment; same
      // tenant-owned-write incident as CMS Displays.
      const tenantId = await this.tenantContext.requireTenantContext();
      config = this.scConfigRepo.create({ branchId, tenantId });
    }

    config.departmentId      = dto.departmentId;
    config.departmentName    = dto.departmentName;
    config.serviceCenterId   = dto.serviceCenterId;
    config.serviceCenterName = dto.serviceCenterName;
    if (dto.intrabranchId !== undefined) config.intrabranchId = dto.intrabranchId ?? null;
    if (dto.tokenPrefix   !== undefined) config.tokenPrefix   = dto.tokenPrefix;
    if (dto.startNumber   !== undefined) config.startNumber   = dto.startNumber;
    if (dto.maxNumber     !== undefined) config.maxNumber     = dto.maxNumber;
    if (dto.resetDaily    !== undefined) config.resetDaily    = dto.resetDaily;
    config.isActive = true;

    const saved = await this.scConfigRepo.save(config);

    await this.auditService.log({
      branchId,
      entityType:  'token_sc_config',
      entityId:    saved.id,
      action:      isNew ? 'CREATE' : 'UPDATE',
      changedBy:   updatedBy,
      beforeState: before as Record<string, unknown> | null ?? undefined,
      afterState:  saved  as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async deactivateScConfig(id: string, branchId: string, updatedBy: string): Promise<void> {
    const config = await this.scConfigRepo.findOne({ where: { id, branchId } });
    if (!config) throw new NotFoundException('SC config not found');
    const before = { ...config };
    config.isActive = false;
    const saved = await this.scConfigRepo.save(config);

    await this.auditService.log({
      branchId,
      entityType:  'token_sc_config',
      entityId:    id,
      action:      'DELETE',
      changedBy:   updatedBy,
      beforeState: before as Record<string, unknown>,
      afterState:  saved  as unknown as Record<string, unknown>,
    });
  }

  async getScConfigById(id: string, branchId: string): Promise<TokenScConfig | null> {
    return this.scConfigRepo.findOne({ where: { id, branchId } });
  }
}

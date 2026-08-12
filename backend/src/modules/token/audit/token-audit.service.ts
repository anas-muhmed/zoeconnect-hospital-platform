import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenAuditLog, AuditAction } from '../entities/token-audit-log.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface AuditEntry {
  branchId?:    string;
  entityType:   string;
  entityId?:    string;
  action:       AuditAction;
  changedBy:    string;
  beforeState?: Record<string, unknown>;
  afterState?:  Record<string, unknown>;
  ipAddress?:   string;
  userAgent?:   string;
  // Stage B (Checkpoint B6) — optional. Most callers across the module don't
  // have a resolved tenantId in scope at their call site, so when omitted
  // log() resolves it itself via TenantContextStorage.currentTenantIdOrNull()
  // (mirrors feedback-audit.service.ts's log() optional-param pattern).
  tenantId?:    string | null;
}

@Injectable()
export class TokenAuditService {
  constructor(
    @InjectRepository(TokenAuditLog)
    private readonly repo: Repository<TokenAuditLog>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    const tenantId = entry.tenantId !== undefined
      ? entry.tenantId
      : await this.tenantContext.currentTenantIdOrNull();

    await this.repo.save(
      this.repo.create({
        branchId:    entry.branchId    ?? null,
        entityType:  entry.entityType,
        entityId:    entry.entityId    ?? null,
        action:      entry.action,
        changedBy:   entry.changedBy,
        beforeState: entry.beforeState ?? null,
        afterState:  entry.afterState  ?? null,
        ipAddress:   entry.ipAddress   ?? null,
        userAgent:   entry.userAgent   ?? null,
        tenantId,
      }),
    );
  }

  private static readonly SELECT = [
    'id', 'branchId', 'entityType', 'entityId', 'action', 'changedBy', 'changedAt',
    'beforeState', 'afterState', 'ipAddress', 'userAgent',
  ] as const;

  // A5.5 API Contract Audit: no controller currently calls this (not a live
  // leak today), but fixed for consistency with the module's other list
  // methods -- explicit select excludes tenantId.
  async findByEntity(entityType: string, entityId: string): Promise<TokenAuditLog[]> {
    return this.repo.find({
      where: { entityType, entityId },
      order: { changedAt: 'DESC' },
      take: 100,
      select: [...TokenAuditService.SELECT],
    });
  }

  // A5.5 API Contract Audit: no controller currently calls this (not a live
  // leak today), but fixed for consistency -- explicit select excludes tenantId.
  async findByBranch(branchId: string, limit = 50): Promise<TokenAuditLog[]> {
    return this.repo.find({
      where: { branchId },
      order: { changedAt: 'DESC' },
      take: limit,
      select: [...TokenAuditService.SELECT],
    });
  }
}

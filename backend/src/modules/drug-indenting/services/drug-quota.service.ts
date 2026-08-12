import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DrugRequest } from '../entities/drug-request.entity';
import { UserRequestQuota } from '../entities/user-request-quota.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { DrugIndentingRequestContext } from '../drug-indenting-request-context';
import { UpdateQuotaDto } from '../dto/update-quota.dto';

function currentQuarterBounds(): { start: Date; end: Date } {
  const start = new Date();
  const qMonth = Math.floor(start.getMonth() / 3) * 3;
  start.setMonth(qMonth, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 3);
  return { start, end };
}

/** Drug Indenting integration (delivery phase). Ports `routes/quota.js` + `routes/dtc.js`'s `/user-quotas`. */
@Injectable()
export class DrugQuotaService {
  constructor(
    @InjectRepository(DrugRequest)
    private readonly requestRepo: Repository<DrugRequest>,
    @InjectRepository(UserRequestQuota)
    private readonly quotaRepo: Repository<UserRequestQuota>,
    @Inject(getTenantScopedRepositoryToken(UserRequestQuota))
    private readonly scopedQuotaRepo: TenantScopedRepository<UserRequestQuota>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private async computeUsage(tenantId: string, userId: string, limit: number) {
    const { start, end } = currentQuarterBounds();
    const used = await this.requestRepo
      .createQueryBuilder('dr')
      .where('dr.tenantId = :tenantId', { tenantId })
      .andWhere('dr.createdByUserId = :userId', { userId })
      .andWhere('dr.createdAt >= :start AND dr.createdAt < :end', { start, end })
      .getCount();
    return { quarterlyLimit: limit, usedThisQuarter: used, remainingQuota: Math.max(0, limit - used) };
  }

  /** Only the caller may view their own quota — same rule as the source. */
  async getOwnQuota(ctx: DrugIndentingRequestContext, targetUserId: string) {
    if (ctx.userId !== targetUserId) {
      throw new ForbiddenException('You are not authorized to view this quota.');
    }
    let quota = await this.scopedQuotaRepo.findOneBy({ tenantId: ctx.tenantId, userId: targetUserId });
    if (!quota) {
      quota = this.quotaRepo.create({ tenantId: ctx.tenantId, userId: targetUserId, quarterlyLimit: 10, updatedBy: targetUserId });
      quota = await this.quotaRepo.save(quota);
    }
    return this.computeUsage(ctx.tenantId, targetUserId, quota.quarterlyLimit);
  }

  /** Ports `dtc.js`'s `GET /user-quotas` — every active Doctor/HOD in the tenant, backfilling missing quota rows. */
  async listAllQuotas(tenantId: string) {
    const users: Array<{ user_id: string; name: string; email: string; role_name: string }> = await this.dataSource.query(
      `SELECT DISTINCT u.id AS user_id, u.full_name AS name, u.email, r.name AS role_name
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE r.tenant_id = $1 AND r.name IN ('DRUG_DOCTOR', 'DRUG_HOD') AND u.is_active = true
        ORDER BY u.full_name`,
      [tenantId],
    );

    const results = [];
    for (const row of users) {
      let quota = await this.scopedQuotaRepo.findOneBy({ tenantId, userId: row.user_id });
      if (!quota) {
        quota = this.quotaRepo.create({ tenantId, userId: row.user_id, quarterlyLimit: 10, updatedBy: row.user_id });
        quota = await this.quotaRepo.save(quota);
      }
      results.push({
        userId: row.user_id, name: row.name, email: row.email, role: row.role_name,
        ...(await this.computeUsage(tenantId, row.user_id, quota.quarterlyLimit)),
      });
    }
    return results;
  }

  async updateQuota(ctx: DrugIndentingRequestContext, targetUserId: string, dto: UpdateQuotaDto) {
    if (dto.quarterlyLimit < 0) throw new BadRequestException('Limit must be a non-negative number.');
    const existing = await this.scopedQuotaRepo.findOneBy({ tenantId: ctx.tenantId, userId: targetUserId });
    if (existing) {
      await this.scopedQuotaRepo.update({ tenantId: ctx.tenantId, userId: targetUserId }, {
        quarterlyLimit: dto.quarterlyLimit, updatedBy: ctx.userId,
      });
    } else {
      const entity = this.quotaRepo.create({ tenantId: ctx.tenantId, userId: targetUserId, quarterlyLimit: dto.quarterlyLimit, updatedBy: ctx.userId });
      await this.quotaRepo.save(entity);
    }
    return { success: true, message: 'Quota updated successfully.' };
  }
}

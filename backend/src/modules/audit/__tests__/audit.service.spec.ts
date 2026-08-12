import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit.service';
import { AuditLog } from '../entities/audit-log.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { QUEUE_NAMES } from '../../../config/redis.config';

/**
 * Task #102 ("Vendor Portal Connector Management," 2026-07-22) --
 * `findRecentForTenant()` is AuditService's first-ever read method (see
 * that method's own doc comment). No spec file existed for AuditService
 * before this task; `log()`'s enqueue behavior is simple enough (and
 * already exercised indirectly by every module that calls it) that it's
 * not retroactively tested here -- scope is the new method only.
 */
describe('AuditService.findRecentForTenant', () => {
  async function createService() {
    const queue = { add: jest.fn() };
    const tenantContext = { isSystemScope: jest.fn(), currentTenantId: jest.fn() };
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getQueueToken(QUEUE_NAMES.AUDIT_LOGS), useValue: queue },
        { provide: TenantContextStorage, useValue: tenantContext },
        { provide: getRepositoryToken(AuditLog), useValue: repo },
      ],
    }).compile();

    return { service: module.get(AuditService), repo, qb };
  }

  it('scopes the query to tenant_id, orders newest-first, and defaults limit to 50', async () => {
    const { service, repo, qb } = await createService();

    await service.findRecentForTenant('tenant-1');

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('log');
    expect(qb.where).toHaveBeenCalledWith('log.tenantId = :tenantId', { tenantId: 'tenant-1' });
    expect(qb.orderBy).toHaveBeenCalledWith('log.createdAt', 'DESC');
    expect(qb.limit).toHaveBeenCalledWith(50);
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('filters by the given action list when provided', async () => {
    const { service, qb } = await createService();

    await service.findRecentForTenant('tenant-1', { actions: ['CONNECTOR_RESYNC_TRIGGERED'], limit: 10 });

    expect(qb.andWhere).toHaveBeenCalledWith('log.action IN (:...actions)', { actions: ['CONNECTOR_RESYNC_TRIGGERED'] });
    expect(qb.limit).toHaveBeenCalledWith(10);
  });
});

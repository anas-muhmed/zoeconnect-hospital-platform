import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Job } from 'bull';
import { QUEUE_NAMES } from '../../config/redis.config';
import { AuditLog } from './entities/audit-log.entity';
import type { AuditLogPayload } from './audit.service';

@Processor(QUEUE_NAMES.AUDIT_LOGS)
export class AuditProcessor {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
  ) {}

  @Process('write-audit-log')
  async handleWriteAuditLog(job: Job<AuditLogPayload>): Promise<void> {
    const data = job.data;
    try {
      const log = this.auditRepo.create({
        action: data.action,
        module: data.module,
        userId: data.userId ?? null,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        oldValue: data.oldValue ?? null,
        newValue: data.newValue ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        requestId: data.requestId ?? null,
        metadata: data.metadata ?? null,
        // Stage B (Checkpoint B6) — resolved by AuditService.log() at
        // enqueue time (see its doc comment); the worker just persists
        // whatever was already resolved, never re-resolves itself.
        tenantId: data.tenantId ?? null,
      });
      await this.auditRepo.save(log);
    } catch (err) {
      this.logger.error(`Failed to write audit log [action=${data.action}]: ${(err as Error).message}`);
      throw err; // triggers Bull retry
    }
  }
}

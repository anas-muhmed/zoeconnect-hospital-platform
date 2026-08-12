import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuditService } from './audit.service';
import { AuditProcessor } from './audit.processor';
import { AuditLog } from './entities/audit-log.entity';
import { QUEUE_NAMES } from '../../config/redis.config';
import { TenantModule } from '../platform/tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    BullModule.registerQueue({ name: QUEUE_NAMES.AUDIT_LOGS }),
    // Stage B (Checkpoint B6) — TenantContextStorage for log()'s
    // enqueue-time tenant resolution.
    TenantModule,
  ],
  providers: [AuditService, AuditProcessor],
  exports: [AuditService],
})
export class AuditModule {}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceAudit } from '../entities/attendance-audit.entity';
import { OracleTenantResolver } from '../../platform/tenant/resolvers/oracle-tenant.resolver';
import type { AttendanceDecision, AttendanceProcessingMode, RosterContext } from '../attendance.types';

@Injectable()
export class AttendanceAuditService {
  constructor(
    @InjectRepository(AttendanceAudit)
    private readonly auditRepo: Repository<AttendanceAudit>,
    // Stage B (Checkpoint B4) — same Oracle-derived resolution as
    // PunchHistoryService, keyed off roster.intraBranchId (same Oracle
    // source, already resolved once per event by RosterResolver).
    private readonly oracleTenantResolver: OracleTenantResolver,
  ) {}

  async record(params: {
    eventId: string | null;
    roster: RosterContext;
    decision: AttendanceDecision;
    mode: AttendanceProcessingMode;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown>;
  }): Promise<AttendanceAudit> {
    const tenantId = await this.oracleTenantResolver.resolveForBranch(params.roster.intraBranchId);
    const audit = this.auditRepo.create({
      eventId: params.eventId,
      employeeCode: params.roster.employeeCode,
      dutyDate: params.roster.dutyDate.toISOString().slice(0, 10),
      mode: params.mode,
      oldStatus: params.roster.actualStatus,
      newStatus: params.decision.status,
      oldValue: params.oldValue,
      newValue: params.newValue,
      reasonCode: params.decision.reasonCode,
      message: params.decision.reason,
      tenantId,
    });
    return this.auditRepo.save(audit);
  }
}


import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../tenant-context.service';

/**
 * Stage B (Checkpoint B1) — Oracle/External-derived tenant resolver.
 *
 * Pattern 2 from `STAGE_B_DESIGN.md` §3, confirmed at Checkpoint A9 as
 * exclusive to the Attendance module: no local Postgres join can resolve
 * tenant ownership, because employee identity lives entirely in Oracle HIS.
 * `RosterResolver.resolve()` (see `modules/attendance/services/
 * roster-resolver.service.ts`) already resolves an Oracle-side
 * `INTRABRANCHID` per employee/duty-date — this class is the standalone hook
 * B4 will call with that value, so `RosterResolver` doesn't need to take on
 * tenant-resolution logic itself.
 *
 * Single-tenant environments always resolve to the seeded 'default' tenant
 * regardless of branch. There is no local Postgres table mapping Oracle
 * branch/service-center identifiers to tenants yet — that arrives with
 * multi-tenant provisioning (Phase 10, per the design doc). Callers should
 * always call through `resolveForBranch()` rather than hardcoding the
 * default tenant themselves, so that when a real mapping table exists, only
 * this method's body changes — no call site does.
 *
 * Not wired into `RosterResolver` or any Attendance write path yet — that is
 * B4's job. As of B1 this class has zero consumers.
 */
@Injectable()
export class OracleTenantResolver {
  constructor(private readonly tenantContext: TenantContextService) {}

  async resolveForBranch(intraBranchId: number | string | null): Promise<string> {
    return this.tenantContext.getCurrentTenantId();
  }
}

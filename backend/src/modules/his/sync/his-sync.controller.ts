import {
  Controller, Get, Post, Query, Param, HttpCode, HttpStatus,
  UseGuards, UseInterceptors, Optional,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam,
} from '@nestjs/swagger';
import { HisSyncService }          from './his-sync.service';
import { HisLoyaltyBridgeService } from '../billing/his-loyalty-bridge.service';
import { OracleDepositLogBridgeService } from '../billing/oracle-deposit-log-bridge.service';
import { JwtAuthGuard }            from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }        from '../../../common/guards/permissions.guard';
import { LicenseGuard }            from '../../licensing/license.guard';
import { RequirePermissions }      from '../../../common/decorators/permissions.decorator';
import { RequireModule }           from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

// See HisController's doc comment for why this interceptor is needed
// (2026-07-21, tenant-scoped Oracle architecture).
@ApiTags('HIS Sync')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('LOYALTY')
@Controller('his/sync')
export class HisSyncController {
  constructor(
    private readonly syncService: HisSyncService,
    @Optional() private readonly hisBridge: HisLoyaltyBridgeService | null,
    @Optional() private readonly depositBridge: OracleDepositLogBridgeService | null,
  ) {}

  /**
   * GET /his/sync/status
   * Returns the current sync cursor (the timestamp from which the next cycle
   * will fetch bills). Useful to show "last synced" info on the loyalty page.
   */
  @Get('status')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'Get HIS sync cursor info' })
  getStatus() {
    return this.syncService.getCursorInfo();
  }

  /**
   * POST /his/sync/backfill?fromDate=2000-01-01
   * Resets the cursor to `fromDate` (defaults to 2000-01-01 — i.e. ALL data)
   * and immediately kicks off one sync cycle. The scheduler continues every 10 s.
   * Response includes diagnostics so the client knows if Oracle isn't connected.
   */
  @Post('backfill')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LOYALTY:ACCOUNTS:CREATE')
  @ApiOperation({ summary: 'Trigger a full historical backfill from HIS' })
  @ApiQuery({ name: 'fromDate', required: false, type: String, description: 'ISO date to start from (default 2000-01-01 = all data)' })
  triggerBackfill(@Query('fromDate') fromDate?: string) {
    const date = fromDate ? new Date(fromDate) : new Date('2000-01-01');
    return this.syncService.triggerImmediateBackfill(date);
  }

  /**
   * GET /his/sync/diagnose
   * Returns a health check: Oracle connected? Config keys loaded? SQL configured?
   * Includes a human-readable hint explaining the root cause if something is wrong.
   */
  @Get('diagnose')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'Diagnose why HIS sync may not be returning data' })
  diagnose() {
    return this.syncService.diagnose();
  }

  /**
   * GET /his/sync/test-bridge
   * Writes a test row to LOYALTY_PATIENT_SUMMARY and immediately deletes it.
   * Returns { success, rowsAffected, error? } so you can confirm the Oracle
   * write path is working end-to-end independently of the loyalty sync.
   */
  @Get('test-bridge')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'Test Oracle bridge write (inserts + deletes a test row)' })
  async testBridge() {
    if (!this.hisBridge) {
      return { success: false, rowsAffected: 0, error: 'HisLoyaltyBridgeService not injected (bridge=null)' };
    }
    return this.hisBridge.testWrite();
  }

  /**
   * GET /his/sync/test-deposit-bridge/:patientId
   * Diagnostic-only lookup — reports whether an active DEPOSIT_LOG Block
   * row (DEPOSIT_TYPE=13) exists for the given patient identifier, and its
   * current amount. Does not modify anything. Use this to confirm the
   * PATIENT_ID binding used by OracleDepositLogBridgeService actually
   * matches Oracle's DEPOSIT_LOG.PATIENT_ID for this tenant before relying
   * on the sync path in production.
   */
  @Get('test-deposit-bridge/:patientId')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'Check whether an active DEPOSIT_LOG Block row exists for a patient (read-only)' })
  @ApiParam({ name: 'patientId', description: 'Patient identifier as bound to DEPOSIT_LOG.PATIENT_ID (MRN/UHID)' })
  async testDepositBridge(@Param('patientId') patientId: string) {
    if (!this.depositBridge) {
      return {
        patientId,
        found: false,
        currentDepositAmount: null,
        depositType: 13,
        status: null,
        matchCount: 0,
        error: 'OracleDepositLogBridgeService not injected (bridge=null)',
      };
    }
    return this.depositBridge.findActiveBlockAmount(patientId);
  }
}

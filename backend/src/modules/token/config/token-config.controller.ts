import {
  Controller, Get, Put, Post, Delete,
  Param, Body, Request, Query, UseGuards, UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { Public }             from '../../../common/decorators/public.decorator';
import { ActiveBranchId }     from '../../../common/decorators/active-branch.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import {
  TokenConfigService, UpdateModeDto, UpdateBrandingDto, UpsertScConfigDto,
} from './token-config.service';
import { TokenService }         from '../token.service';
import { TokenSequenceService } from '../queue/token-sequence.service';
import { TokenGateway }         from '../token.gateway';
import { TokenAuditService }    from '../audit/token-audit.service';
import { ManualResetDto }       from '../dto/token-payloads.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('QUEUE')
@Controller('token/config')
export class TokenConfigController {
  constructor(
    private readonly configService:   TokenConfigService,
    private readonly tokenService:    TokenService,
    private readonly sequenceService: TokenSequenceService,
    private readonly gateway:         TokenGateway,
    private readonly auditService:    TokenAuditService,
  ) {}

  // -- Branch mode ------------------------------------------------------------

  @Get()
  @RequirePermissions('TOKEN:CONFIG:READ')
  @UseInterceptors(TenantContextInterceptor)
  getBranchConfig(@ActiveBranchId() branchId: string) {
    return this.configService.getBranchConfig(branchId);
  }

  @Get('mode')
  @RequirePermissions('TOKEN:CONFIG:READ')
  @UseInterceptors(TenantContextInterceptor)
  getMode(@ActiveBranchId() branchId: string) {
    return this.configService.getMode(branchId).then((mode) => ({ mode }));
  }

  @Put('mode')
  @RequirePermissions('TOKEN:CONFIG:WRITE')
  @UseInterceptors(TenantContextInterceptor)
  async updateMode(
    @ActiveBranchId() branchId: string,
    @Body() dto: UpdateModeDto,
    @Request() req: any,
    @Query('force') force?: string,
  ) {
    const result = await this.configService.updateMode(branchId, dto, req.user.id, force === 'true');

    // Bug fix: operators already on the Token Queue counter screen for this
    // branch were stuck showing the old issuance mode (LOCATION_BASED vs
    // SERVICE_CENTER_BASED) until they manually reloaded, because nothing
    // told their already-cached `GET /token/config` react-query result to
    // refetch. Push a live notification so their join panel switches
    // immediately instead of silently going stale.
    if (!('warning' in result)) {
      this.gateway.broadcastModeChanged(branchId, result.mode);
    }

    return result;
  }

  // -- Branding ---------------------------------------------------------------

  @Get('branding')
  @Public()
  getBranding(@ActiveBranchId() branchId: string) {
    return this.configService.getBranding(branchId);
  }

  @Put('branding')
  @RequirePermissions('TOKEN:CONFIG:WRITE')
  updateBranding(
    @ActiveBranchId() branchId: string,
    @Body() dto: UpdateBrandingDto,
    @Request() req: any,
  ) {
    return this.configService.updateBranding(branchId, dto, req.user.id);
  }

  // -- SC Configs -------------------------------------------------------------

  @Get('sc-configs')
  @RequirePermissions('TOKEN:CONFIG:READ')
  @UseInterceptors(TenantContextInterceptor)
  listScConfigs(@ActiveBranchId() branchId: string) {
    return this.configService.listScConfigs(branchId);
  }

  /**
   * Fix (2026-08-07): previously missing `TenantContextInterceptor` on both
   * this route and `updateScConfig` below — same bug class as
   * `CmsDisplayController.create()` (see HYBRID_ARCHITECTURE_LOG.md).
   * `TokenConfigService.upsertScConfig()` only stamps `tenantId` when
   * creating a brand-new config row (`token-config.service.ts` around line
   * 270), via `tenantContext.currentTenantIdOrNull()` — with no interceptor
   * establishing context first, that call always resolved `null`, so the
   * first SC config created for a branch was invisible to `listScConfigs()`
   * (scoped, line 97 above) even though it existed in the DB.
   */
  @Post('sc-configs')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  upsertScConfig(
    @ActiveBranchId() branchId: string,
    @Body() dto: UpsertScConfigDto,
    @Request() req: any,
  ) {
    return this.configService.upsertScConfig(branchId, dto, req.user.id);
  }

  @Put('sc-configs/:id')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  updateScConfig(
    @Param('id') id: string,
    @ActiveBranchId() branchId: string,
    @Body() dto: UpsertScConfigDto,
    @Request() req: any,
  ) {
    // upsert with id resolution is handled by service
    return this.configService.upsertScConfig(branchId, dto, req.user.id);
  }

  @Delete('sc-configs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  async deleteScConfig(
    @Param('id') id: string,
    @ActiveBranchId() branchId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.configService.deactivateScConfig(id, branchId, req.user.id);
  }

  // -- Manual reset (SUPER_ADMIN only) ----------------------------------------

  /**
   * Reset token counters back to 1 for today.
   *
   * Handles both modes:
   *   LOCATION mode  — zeroes Redis issued-count + clears called-set for all
   *                    active locations in the branch (or a single one if
   *                    referenceId is provided).
   *   SERVICE_CENTER — resets token_sequences.current_number to startNumber
   *                    for all (or one) sequences for today.
   *
   * Also clears currentToken on all counter display rows and broadcasts
   * a fresh state to all connected clients.
   *
   * Body: { referenceType?: 'LOCATION'|'SERVICE_CENTER'; referenceId?: string }
   * Omit body (or leave both undefined) to reset everything in the branch.
   */
  @Post('reset')
  @RequirePermissions('TOKEN:COUNTER:MANAGE')
  async manualReset(
    @ActiveBranchId() branchId: string,
    @Body() body: ManualResetDto,
    @Request() req: any,
  ) {
    const { referenceType, referenceId } = body;

    // 1. Reset Redis LOCATION counters
    if (!referenceType || referenceType === 'LOCATION') {
      if (referenceId) {
        await this.tokenService.manualResetLocation(referenceId);
      } else {
        await this.tokenService.manualResetBranch(branchId);
      }
    }

    // 2. Reset PostgreSQL SERVICE_CENTER sequences
    if (!referenceType || referenceType === 'SERVICE_CENTER') {
      await this.sequenceService.manualResetSequences({
        branchId,
        referenceType: referenceType ?? undefined,
        referenceId:   referenceId   ?? undefined,
      });
    }

    // 3. Audit log the reset action
    await this.auditService.log({
      branchId,
      entityType:  'token_reset',
      entityId:    referenceId ?? branchId,
      action:      'RESET',
      changedBy:   req.user.id,
      beforeState: { referenceType, referenceId } as Record<string, unknown>,
      afterState:  { resetTo: 1, resetAt: new Date().toISOString() } as Record<string, unknown>,
    });

    // 4. Broadcast updated state so counter panels clear immediately
    await this.gateway.broadcastState(branchId);
    this.gateway.broadcastReset(branchId);

    return {
      ok:            true,
      branchId,
      referenceType: referenceType ?? 'ALL',
      referenceId:   referenceId   ?? 'ALL',
      resetAt:       new Date().toISOString(),
    };
  }
}

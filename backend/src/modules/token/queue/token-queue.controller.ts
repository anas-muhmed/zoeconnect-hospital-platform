import {
  Controller, Post, Param, Body, Request,
  UseGuards, UseInterceptors, HttpCode, HttpStatus, Get, Query, Logger,
} from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { Public }             from '../../../common/decorators/public.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { TokenQueueService }  from './token-queue.service';
import { TokenKioskService }  from '../kiosk/token-kiosk.service';
import { TokenGateway }       from '../token.gateway';
import { TokenService }       from '../token.service';
import { RecordReferenceType, TokenType } from '../entities/token-record.entity';

@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('QUEUE')
@Controller('token/queue')
export class TokenQueueController {
  private readonly logger = new Logger(TokenQueueController.name);

  constructor(
    private readonly queueService:  TokenQueueService,
    private readonly kioskService:  TokenKioskService,
    private readonly gateway:       TokenGateway,
    private readonly tokenService:  TokenService,
  ) {}

  // -- Public kiosk issue (no auth) -------------------------------------------

  /**
   * Issue a token from a kiosk.
   *
   * Routes through the OLD TokenService.issueToken() (Redis INCR) so the
   * counter panel and kiosk share the same sequence. The old service
   * already does a fire-and-forget write to token_records for persistence.
   *
   * Body: { assignmentIndex?: number, tokenType?: string }
   */
  @Post('kiosk/:slug/issue')
  @Public()
  async issueFromKiosk(
    @Param('slug') slug: string,
    @Body() body?: { assignmentIndex?: number; tokenType?: TokenType },
  ) {
    const kiosk       = await this.kioskService.getBySlug(slug);
    const assignments = (kiosk.assignments ?? []).filter((a) => a.isActive);
    const assignment  = assignments[body?.assignmentIndex ?? 0];

    if (!assignment) {
      throw new Error('No active assignment at the requested index');
    }

    let tokenNumber: number;
    let branchId:    string | null;
    let fullToken:   string;
    let tokenPrefix: string = '';

    if (assignment.assignmentType === 'LOCATION' && assignment.locationId) {
      // ── LOCATION mode: route through old Redis-based system ──────────────
      // This keeps the counter panel and kiosk on the exact same sequence.
      const result = await this.tokenService.issueToken(assignment.locationId);
      tokenNumber  = result.tokenNumber;
      branchId     = result.branchId;
      fullToken    = result.fullToken;
      tokenPrefix  = result.tokenPrefix;
    } else {
      // ── SERVICE_CENTER mode: use new token_sequences system ───────────────
      const { record, rolledOver, maxNumber, startNumber } = await this.queueService.issueFromKiosk({
        kiosk,
        kioskSlug:       slug,
        assignmentIndex: body?.assignmentIndex ?? 0,
        tokenType:       body?.tokenType ?? 'WALK_IN',
      });
      tokenNumber = record.tokenNumber;
      branchId    = record.branchId;
      fullToken   = record.fullToken;
      tokenPrefix = record.tokenPrefix;

      // GAP-20: notify branch room on rollover
      if (rolledOver) {
        this.gateway.broadcastRollover(
          branchId ?? kiosk.branchId,
          assignment.serviceCenterId ?? '',
          maxNumber,
          startNumber,
        );
      }
    }

    // Broadcast so the counter updates immediately. Fire-and-forget --
    // broadcastState() recomputes state for EVERY location in the branch
    // (Redis + Postgres round trips per location/counter), none of which
    // the kiosk itself needs: the response below already has everything
    // (tokenNumber/fullToken/tokenPrefix) the kiosk's own "please wait,
    // printing" screen depends on. Awaiting it here meant every single
    // kiosk print was held hostage by a full branch-wide state
    // recomputation before the kiosk ever saw its own response -- the
    // direct cause of the multi-second delay before the print screen shows,
    // independent of printBufferTime (that setting only affects what
    // happens *after* the response arrives, see the kiosk page's onSuccess
    // handler).
    this.gateway.broadcastTokenIssued(
      assignment.locationId ?? assignment.serviceCenterId ?? '',
      tokenNumber,
      branchId ?? kiosk.branchId,
    );
    this.gateway.broadcastState(branchId ?? kiosk.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState after kiosk issue failed: ${(err as Error).message}`),
    );

    return { tokenNumber, fullToken, tokenPrefix, referenceId: assignment.locationId ?? assignment.serviceCenterId };
  }

  // -- Queue state (used by kiosk page to show waiting count) -----------------
  // For LOCATION type: reads old system (Redis) for accurate count.
  // For SERVICE_CENTER type: reads token_records.

  @Get('state/:referenceType/:referenceId')
  @Public()
  async getQueueState(
    @Param('referenceType') referenceType: RecordReferenceType,
    @Param('referenceId') referenceId: string,
    @Query('limit') limit?: string,
  ) {
    if (referenceType === 'LOCATION') {
      // Use old system for accurate counter-consistent waiting count
      const state = await this.tokenService.getLocationState(referenceId);
      const waiting = state ? state.issuedCount - state.calledTokens.length : 0;
      return { waiting, waitingTokens: [], recentCalled: [] };
    }

    // SERVICE_CENTER: use new token_records
    const [waiting, called] = await Promise.all([
      this.queueService.getWaitingQueue(referenceType, referenceId),
      this.queueService.getRecentCalled(referenceType, referenceId, limit ? +limit : 5),
    ]);
    return {
      waiting:       waiting.length,
      waitingTokens: waiting.map((r) => ({ id: r.id, fullToken: r.fullToken, priority: r.priority })),
      recentCalled:  called.map((r) => ({
        id: r.id, fullToken: r.fullToken, calledAt: r.calledAt, counterId: r.counterId,
      })),
    };
  }

  // -- Operator token operations (all require COUNTER:OPERATE) ----------------

  @Post('complete/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  @UseInterceptors(TenantContextInterceptor)
  async complete(@Param('id') id: string, @Request() req: any) {
    const record = await this.queueService.completeToken(id, req.user.id);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return { status: record.status };
  }

  @Post('hold/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  @UseInterceptors(TenantContextInterceptor)
  async hold(@Param('id') id: string) {
    const record = await this.queueService.holdToken(id);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return { status: record.status };
  }

  @Post('skip/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  @UseInterceptors(TenantContextInterceptor)
  async skip(@Param('id') id: string) {
    const record = await this.queueService.skipToken(id);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return { status: record.status };
  }

  @Post('miss/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  @UseInterceptors(TenantContextInterceptor)
  async miss(@Param('id') id: string) {
    const record = await this.queueService.missToken(id);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return { status: record.status };
  }

  @Post('cancel/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async cancel(@Param('id') id: string, @Request() req: any) {
    const record = await this.queueService.cancelToken(id, req.user.id);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return { status: record.status };
  }

  @Post('transfer/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  @UseInterceptors(TenantContextInterceptor)
  async transfer(
    @Param('id') id: string,
    @Body() body: { toCounterId: string },
    @Request() req: any,
  ) {
    const record = await this.queueService.transferToken(id, body.toCounterId, req.user.id);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return { status: record.status, counterId: record.counterId };
  }

  @Post('reissue/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async reissue(@Param('id') id: string, @Request() req: any) {
    const record = await this.queueService.reissueToken(id, req.user.id);
    this.gateway.broadcastTokenIssued(record.referenceId, record.tokenNumber, record.branchId);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return {
      tokenNumber: record.tokenNumber,
      fullToken:   record.fullToken,
      recordId:    record.id,
    };
  }

  @Post('serve/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  @UseInterceptors(TenantContextInterceptor)
  async serve(@Param('id') id: string) {
    const record = await this.queueService.serveToken(id);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return { status: record.status };
  }

  @Post('recall/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  @UseInterceptors(TenantContextInterceptor)
  async recall(@Param('id') id: string) {
    const record = await this.queueService.recallToken(id);
    this.gateway.broadcastState(record.branchId).catch((err: unknown) =>
      this.logger.warn(`broadcastState failed: ${(err as Error).message}`),
    );
    return { status: record.status };
  }

}

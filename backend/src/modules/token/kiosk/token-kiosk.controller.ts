import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  Request, UseGuards, UseInterceptors, HttpCode, HttpStatus, Header,
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
  TokenKioskService, CreateKioskDto, AddAssignmentDto, MigrateAssignmentDto,
} from './token-kiosk.service';
import { TokenQueueService }  from '../queue/token-queue.service';
import { TokenService }       from '../token.service';
import { TokenGateway }       from '../token.gateway';
import { TokenType }          from '../entities/token-record.entity';

@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('QUEUE')
@Controller()
export class TokenKioskController {
  constructor(
    private readonly kioskService: TokenKioskService,
    private readonly queueService: TokenQueueService,
    private readonly tokenService: TokenService,
    private readonly gateway:      TokenGateway,
  ) {}

  // -- Public kiosk endpoints (no auth) --------------------------------------

  /** Public: load kiosk config (including branding) by slug */
  @Get('kiosk/:slug')
  @Public()
  getPublicKiosk(@Param('slug') slug: string) {
    return this.kioskService.getPublicKioskConfig(slug);
  }

  /**
   * Bug fix (2026-07-31): tenant-independent counterpart to
   * `GET /token/public/state?branchId=...`, for the `/kiosk/[slug]`
   * MULTIPLE-type kiosk page specifically. That query-param route depends
   * on `req.tenantId` (subdomain-resolved), which is unavailable on plain
   * hosts with no subdomain -- see TokenKioskService.getTenantAndBranchBySlug()'s
   * doc comment for the full incident. This route resolves the kiosk's own
   * (tenantId, branchId) from its slug instead, the same way its config
   * endpoint above already does, and passes that explicitly to
   * getPublicState() so the result can never be scoped to the wrong tenant
   * or (worse) skip tenant scoping entirely.
   */
  @Get('kiosk/:slug/public-state')
  @Public()
  async getPublicStateForKiosk(@Param('slug') slug: string) {
    const { tenantId, branchId } = await this.kioskService.getTenantAndBranchBySlug(slug);
    return this.tokenService.getPublicState(branchId, tenantId);
  }

  /**
   * GAP-9: Canonical token-issue endpoint at /kiosk/:slug/issue.
   * Replaces the old /token/queue/kiosk/:slug/issue path.
   * Routes LOCATION mode through the Redis-based TokenService (keeps counter
   * display and kiosk on the same sequence) and SERVICE_CENTER mode through
   * the new token_sequences system. This branch is now safe by construction:
   * TokenKioskService.assertNoConflictingAssignment()/migrateAssignment()
   * guarantee a given logical queue is never reachable through both an
   * active LOCATION-type and an active SERVICE_CENTER-type assignment at
   * once, so assignment.assignmentType is always the single source of truth
   * for which numbering system a request should use.
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
      // LOCATION mode: route through Redis-based system so counter and kiosk
      // share the exact same sequence counter.
      const result = await this.tokenService.issueToken(assignment.locationId);
      tokenNumber  = result.tokenNumber;
      branchId     = result.branchId;
      fullToken    = result.fullToken;
      tokenPrefix  = result.tokenPrefix;
    } else {
      // SERVICE_CENTER mode: use new token_sequences + token_records system.
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

    // Broadcast so the counter panel updates immediately
    this.gateway.broadcastTokenIssued(
      assignment.locationId ?? assignment.serviceCenterId ?? '',
      tokenNumber,
      branchId ?? kiosk.branchId,
    );
    await this.gateway.broadcastState(branchId ?? kiosk.branchId);

    return {
      tokenNumber,
      fullToken,
      tokenPrefix,
      referenceId: assignment.locationId ?? assignment.serviceCenterId,
    };
  }

  /**
   * GAP-10: Queue state by kiosk slug.
   * Returns waiting count + recent called tokens for the kiosk's primary assignment.
   * Used by the kiosk page to show estimated wait time without requiring a reference ID.
   */
  @Get('kiosk/:slug/state')
  @Public()
  async getKioskState(@Param('slug') slug: string) {
    const kiosk = await this.kioskService.getBySlug(slug);
    const assignment = (kiosk.assignments ?? []).filter((a) => a.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder)[0];

    if (!assignment) {
      return { waiting: 0, waitingTokens: [], recentCalled: [] };
    }

    if (assignment.assignmentType === 'LOCATION' && assignment.locationId) {
      // LOCATION mode: use Redis-based state for accurate counter-consistent count
      const state = await this.tokenService.getLocationState(assignment.locationId);
      const waiting = state ? state.issuedCount - state.calledTokens.length : 0;
      return { waiting, waitingTokens: [], recentCalled: state?.calledTokens ?? [] };
    }

    // SERVICE_CENTER mode: use token_records
    const referenceId   = assignment.serviceCenterId ?? '';
    const referenceType = 'SERVICE_CENTER' as const;

    const [waitingList, calledList] = await Promise.all([
      this.queueService.getWaitingQueue(referenceType, referenceId),
      this.queueService.getRecentCalled(referenceType, referenceId, 5),
    ]);

    return {
      waiting:       waitingList.length,
      waitingTokens: waitingList.map((r) => ({
        id: r.id, fullToken: r.fullToken, priority: r.priority,
      })),
      recentCalled: calledList.map((r) => ({
        id: r.id, fullToken: r.fullToken, calledAt: r.calledAt, counterId: r.counterId,
      })),
    };
  }

  /** Public: simple QR code SVG for a kiosk URL */
  @Get('kiosk/:slug/qr')
  @Public()
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=3600')
  async getQrCode(@Param('slug') slug: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QRCode = require('qrcode');
    const url = `/kiosk/${slug}`;
    return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M' });
  }

  // -- Admin kiosk management -------------------------------------------------

  @Get('token/kiosks')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  listKiosks(@ActiveBranchId() branchId: string) {
    return this.kioskService.listKiosks(branchId);
  }

  @Post('token/kiosks')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  createKiosk(
    @ActiveBranchId() branchId: string,
    @Body() dto: CreateKioskDto,
    @Request() req: any,
  ) {
    return this.kioskService.createKiosk(branchId, dto, req.user.id);
  }

  @Get('token/kiosks/:slug')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  getKiosk(
    @Param('slug') slug: string,
    @ActiveBranchId() branchId: string,
  ) {
    return this.kioskService.getBySlug(slug);
  }

  @Patch('token/kiosks/:slug')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  updateKiosk(
    @Param('slug') slug: string,
    @ActiveBranchId() branchId: string,
    @Body() dto: { name?: string; description?: string; isActive?: boolean },
    @Request() req: any,
  ) {
    return this.kioskService.getBySlug(slug).then((kiosk) =>
      this.kioskService.updateKiosk(kiosk.id, branchId, dto, req.user.id),
    );
  }

  @Post('token/kiosks/:slug/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async disableKiosk(
    @Param('slug') slug: string,
    @ActiveBranchId() branchId: string,
    @Request() req: any,
  ): Promise<void> {
    const kiosk = await this.kioskService.getBySlug(slug);
    await this.kioskService.disableKiosk(kiosk.id, branchId, req.user.id);
  }

  @Post('token/kiosks/:slug/enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async enableKiosk(
    @Param('slug') slug: string,
    @ActiveBranchId() branchId: string,
    @Request() req: any,
  ): Promise<void> {
    const kiosk = await this.kioskService.getBySlug(slug);
    await this.kioskService.enableKiosk(kiosk.id, branchId, req.user.id);
  }

  @Post('token/kiosks/:slug/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async archiveKiosk(
    @Param('slug') slug: string,
    @ActiveBranchId() branchId: string,
    @Request() req: any,
  ): Promise<void> {
    const kiosk = await this.kioskService.getBySlug(slug);
    await this.kioskService.archiveKiosk(kiosk.id, branchId, req.user.id);
  }

  // -- Kiosk QR (admin, with host-aware full URL) ----------------------------

  @Get('token/kiosks/:slug/qr')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @Header('Content-Type', 'image/svg+xml')
  async getAdminQrCode(
    @Param('slug') slug: string,
    @Request() req: any,
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QRCode = require('qrcode');
    const host = `${req.protocol}://${req.get?.('host') ?? req.hostname}`;
    const url  = `${host}/kiosk/${slug}`;
    return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M' });
  }

  // -- Assignments -----------------------------------------------------------

  @Post('token/kiosks/:slug/assignments')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async addAssignment(
    @Param('slug') slug: string,
    @ActiveBranchId() branchId: string,
    @Body() dto: AddAssignmentDto,
    @Request() req: any,
  ) {
    const kiosk = await this.kioskService.getBySlug(slug);
    return this.kioskService.addAssignment(kiosk.id, branchId, dto, req.user.id);
  }

  @Delete('token/kiosks/:slug/assignments/:assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  async removeAssignment(
    @Param('slug') slug: string,
    @Param('assignmentId') assignmentId: string,
    @ActiveBranchId() branchId: string,
    @Request() req: any,
  ): Promise<void> {
    const kiosk = await this.kioskService.getBySlug(slug);
    await this.kioskService.removeAssignment(assignmentId, kiosk.id, branchId, req.user.id);
  }

  /**
   * Explicit, sanctioned way to switch an assignment between LOCATION and
   * SERVICE_CENTER mode -- deactivates the source assignment, creates the
   * target, and reconciles the target's numbering source from whatever's
   * already been issued for this queue today, all as one operation. This is
   * the only path allowed to bypass TokenKioskService's mutual-exclusion
   * guard between the two modes; using DELETE + POST separately to achieve
   * the same effect is exactly what caused CEO OFFICE's duplicate token
   * numbers, since neither call knows about the other or reconciles
   * anything.
   */
  @Post('token/kiosks/:slug/assignments/:assignmentId/migrate')
  @RequirePermissions('TOKEN:KIOSK:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async migrateAssignment(
    @Param('slug') slug: string,
    @Param('assignmentId') assignmentId: string,
    @ActiveBranchId() branchId: string,
    @Body() dto: MigrateAssignmentDto,
    @Request() req: any,
  ) {
    const kiosk = await this.kioskService.getBySlug(slug);
    return this.kioskService.migrateAssignment(kiosk.id, branchId, assignmentId, dto, req.user.id);
  }
}

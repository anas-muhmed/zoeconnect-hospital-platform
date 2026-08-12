import {
  Controller, Get, Post, Patch, Delete, Put, Param, Body,
  UseGuards, UseInterceptors, Request, HttpCode, HttpStatus, Query, ParseIntPipe,
  BadRequestException, NotFoundException, Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import * as path from 'path';
import * as fs from 'fs';
import { DisplayTheme } from './token.service';
import { JwtAuthGuard }       from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../common/guards/permissions.guard';
import { LicenseGuard }       from '../licensing/license.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule }      from '../licensing/decorators/require-module.decorator';
import { Public }             from '../../common/decorators/public.decorator';
import { ActiveBranchId }     from '../../common/decorators/active-branch.decorator';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { TokenService }       from './token.service';
import { TokenGateway }       from './token.gateway';
import { ObjectRepositoryService } from '../platform/services/object-repository/services/object-repository.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
  CounterActionDto,
  CallTokenDto,
  EnsureServiceCenterDto,
  IssueTokenDto,
} from './dto/token-payloads.dto';

// Fix (2026-07-20, real incident -- MOSC cloud tenant): this controller
// imported TenantContextInterceptor but never actually applied it at the
// class level, unlike every sibling token/* controller (queue,
// registration, kiosk, config, display). Every write path in this file
// (createLocation, joinCounter/leaveCounter, callToken, resetCounter,
// issueToken, uploadMedia, etc.) resolves tenantId via
// tenantContext.currentTenantIdOrNull() -- which silently returns null
// with no ambient context established. Since TokenLocation/TokenCounter/
// TokenCall/TokenRecord all declare tenant_id as nullable, those inserts
// never failed loudly; they just silently wrote tenant_id = NULL. Every
// *read* here goes through the tenant-scoped TokenCall repo
// (getRecentCalls(), used by the one route -- getHistory -- that DID
// already have the interceptor), whose query always filters
// `tenantId = :realTenantId` -- which a NULL-tenant_id row can never
// match. Net effect for a cloud tenant with no ambient context anywhere
// else in this controller: locations/counters/calls could be created but
// then permanently vanished from every tenant-scoped read, indistinguishable
// from "creation failing" to the end user. Self-hosted was never exposed to
// this because nothing in that deployment mode depends on a real,
// per-tenant filter matching here.
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('QUEUE')
@UseInterceptors(TenantContextInterceptor)
@Controller('token')
export class TokenController {
  constructor(
    private readonly tokenService: TokenService,
    private readonly gateway:      TokenGateway,
    private readonly objectRepository: ObjectRepositoryService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // -- Public (TV display board — no auth) -----------------------------------
  //
  // Fix (2026-07-20, real incident -- Token Queue "Join a Billing Counter"
  // cross-tenant leak, root-caused after the tenant-context-interceptor
  // Observable-timing fix): these two routes are @Public(), so
  // TenantContextInterceptor runs with no JWT principal and its resolved
  // tenant falls back to whatever SessionTenantResolver's ambient default
  // is -- NOT the tenant actually making the request. The reliable signal
  // here is `req.tenantId`, set on every request (authenticated or not) by
  // SubdomainTenantMiddleware's Fastify hook in main.ts, from the
  // Host/X-Forwarded-Host header -- same pattern already used by
  // SetupController's public vendor-registration routes. Passed through
  // explicitly to TokenService instead of relying on ambient
  // TenantContextStorage.

  @Get('public/state')
  @Public()
  getPublicState(
    @Query('branchId') branchId: string | undefined,
    @Req() req: FastifyRequest & { tenantId?: string },
  ) {
    return this.tokenService.getPublicState(branchId ?? null, req.tenantId ?? null);
  }

  @Get('public/location/:code')
  @Public()
  async getPublicLocationByCode(
    @Param('code') code: string,
    @Req() req: FastifyRequest & { tenantId?: string },
  ) {
    const loc = await this.tokenService.getPublicLocationByCode(code, req.tenantId ?? null);
    if (!loc) throw new NotFoundException(`No active location with code "${code}"`);
    return loc;
  }

  // Cloud Token Queue Display fix (2026-07-31, real incident): the above
  // /public/location/:code route depends on req.tenantId, which cloud
  // tenants can't reliably get (no per-tenant subdomain for
  // SubdomainTenantMiddleware to resolve -- falls back to 'default',
  // silently returning nothing for a real cloud tenant's location code).
  // displayToken is globally unique (see TokenLocation.displayToken's doc
  // comment), so this route needs no tenant resolution at all -- same
  // precedent as DisplayController's `display-pages/:slug`. This is the
  // route the display board should use going forward; /public/location/:code
  // stays for backward compatibility (self-hosted was never affected, since
  // 'default' is genuinely its only tenant).
  @Get('public/location/by-token/:token')
  @Public()
  async getPublicLocationByDisplayToken(@Param('token') token: string) {
    const loc = await this.tokenService.getPublicLocationByDisplayToken(token);
    if (!loc) throw new NotFoundException('No active location for this display token');
    return loc;
  }

  @Get('public/display-config')
  @Public()
  getPublicDisplayConfig() {
    return this.tokenService.getDisplayConfig();
  }

  // -- Locations -------------------------------------------------------------

  /** List active locations (all authenticated users need this for the join panel) */
  @Get('locations')
  @RequirePermissions('TOKEN:COUNTER:READ')
  getLocations(@ActiveBranchId() branchId: string) {
    return this.tokenService.getLocations(true, branchId);
  }

  /** All locations incl. inactive — admin only */
  @Get('locations/all')
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  getAllLocations() {
    return this.tokenService.getLocations(false);
  }

  /** Full state snapshot for one location (counters + occupancy + calledTokens) */
  @Get('locations/:id/state')
  @RequirePermissions('TOKEN:COUNTER:READ')
  getLocationState(@Param('id') id: string) {
    return this.tokenService.getLocationState(id);
  }

  /** Create a new billing location */
  @Post('locations')
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  async createLocation(
    @Body() body: CreateLocationDto,
    @ActiveBranchId() branchId: string,
  ) {
    const location = await this.tokenService.createLocation(body.label, branchId);
    await this.gateway.broadcastState(branchId);
    return location;
  }

  /** Rename / reorder / re-prefix a location */
  @Patch('locations/:id')
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  async updateLocation(
    @Param('id') id: string,
    @Body() body: UpdateLocationDto,
    @ActiveBranchId() branchId: string,
  ) {
    const location = await this.tokenService.updateLocation(id, body);
    await this.gateway.broadcastState(branchId);
    return location;
  }

  /** Toggle a location active/inactive */
  @Patch('locations/:id/toggle')
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  async toggleLocation(
    @Param('id') id: string,
    @ActiveBranchId() branchId: string,
  ) {
    const location = await this.tokenService.toggleLocation(id);
    await this.gateway.broadcastState(branchId);
    return location;
  }

  // -- Session (REST fallback — WS is preferred) -----------------------------

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  async joinCounter(
    @Body() body: CounterActionDto,
    @Request() req: any,
    @ActiveBranchId() branchId: string,
  ) {
    await this.tokenService.joinCounter(req.user.id, body.locationId, body.counterNumber);
    await this.gateway.broadcastState(branchId);
    return { ok: true };
  }

  @Delete('leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  async leaveCounter(
    @Body() body: CounterActionDto,
    @Request() req: any,
    @ActiveBranchId() branchId: string,
  ) {
    await this.tokenService.leaveCounter(req.user.id, body.locationId, body.counterNumber);
    await this.gateway.broadcastState(branchId);
  }

  // -- Token call (REST fallback) ---------------------------------------------

  @Post('call')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:COUNTER:OPERATE')
  async callToken(
    @Body() body: CallTokenDto,
    @Request() req: any,
    @ActiveBranchId() branchId: string,
  ) {
    const payload = await this.tokenService.callToken(
      req.user.id,
      body.locationId,
      body.counterNumber,
      body.tokenNumber,
    );
    this.gateway.broadcastTokenCalled(payload);
    await this.gateway.broadcastState(branchId);
    return payload;
  }

  // -- Reset -----------------------------------------------------------------

  @Delete('locations/:id/counters/:num/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:COUNTER:MANAGE')
  async resetCounter(
    @Param('id') locationId: string,
    @Param('num', ParseIntPipe) counterNumber: number,
    @ActiveBranchId() branchId: string,
  ) {
    await this.tokenService.resetCounter(locationId, counterNumber);
    await this.gateway.broadcastState(branchId);
  }

  // -- History ---------------------------------------------------------------

  @Get('locations/:id/history')
  @RequirePermissions('TOKEN:COUNTER:READ')
  @UseInterceptors(TenantContextInterceptor)
  getHistory(
    @Param('id') locationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.tokenService.getRecentCalls(locationId, limit ? parseInt(limit, 10) : 20);
  }

  // -- Display config (superadmin) -------------------------------------------

  @Get('display-config')
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  getDisplayConfig() {
    return this.tokenService.getDisplayConfig();
  }

  @Put('display-config')
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async saveDisplayConfig(@Body() config: any, @Request() req: any) {
    const saved = await this.tokenService.saveDisplayConfig(config, req.user.id);
    // Broadcast to all connected display boards so they hot-reload
    this.gateway.broadcastConfigUpdated(saved);
    return saved;
  }

  // -- Print config (superadmin) ---------------------------------------------

  @Get('print-config')
  @Public() // Needs to be accessible by kiosk
  getPrintConfig() {
    return this.tokenService.getPrintConfig();
  }

  @Put('print-config')
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async savePrintConfig(@Body() config: any, @Request() req: any) {
    const saved = await this.tokenService.savePrintConfig(config, req.user.id);
    this.gateway.broadcastConfigUpdated(saved);
    return saved;
  }

  // -- HIS Department / Service Center lookups (public — used by kiosk) --------

  @Get('his/departments')
  @Public()
  async getHisDepartments(@Query('branchId') branchId: string) {
    if (!branchId) throw new BadRequestException('branchId is required');
    return this.tokenService.getDepartmentsFromHis(branchId);
  }

  @Get('his/service-centers')
  @Public()
  async getHisServiceCenters(
    @Query('branchId')    branchId:    string,
    @Query('departmentId') departmentId?: string,
  ) {
    if (!branchId) throw new BadRequestException('branchId is required');
    return this.tokenService.getServiceCentersFromHis(branchId, departmentId ?? null);
  }

  // Direct by-ID lookups -- used as a fallback by the join panel when a
  // HIS-selected department/service center ID isn't present in the general
  // (filtered) lists above, so the UI can still show the real Oracle name.
  @Get('his/departments/:id')
  @Public()
  async getHisDepartmentById(@Param('id') id: string) {
    const dept = await this.tokenService.getHisDepartmentById(id);
    if (!dept) throw new BadRequestException(`Department ${id} not found`);
    return dept;
  }

  @Get('his/service-centers/:id')
  @Public()
  async getHisServiceCenterById(@Param('id') id: string) {
    const sc = await this.tokenService.getHisServiceCenterById(id);
    if (!sc) throw new BadRequestException(`Service center ${id} not found`);
    return sc;
  }

  /** Find or auto-create a token location for a given HIS service center */
  @Post('service-center/ensure')
  @Public()
  async ensureServiceCenterLocation(
    @Body() body: EnsureServiceCenterDto,
  ) {
    const { serviceCenterId, serviceCenterName, departmentId, departmentName, intrabranchId, branchId } = body;
    if (!serviceCenterId || !intrabranchId) {
      throw new BadRequestException('serviceCenterId and intrabranchId are required');
    }
    const loc = await this.tokenService.ensureLocationForServiceCenter({
      serviceCenterId,
      serviceCenterName: serviceCenterName ?? '',
      departmentId,
      departmentName:    departmentName    ?? '',
      intrabranchId,
      branchId:          branchId          ?? null,
    });
    // Public/kiosk caller -- no JWT to pull branchId from, so use the
    // resolved location's own branchId (set by ensureLocationForServiceCenter,
    // falling back to the caller-supplied one) rather than defaulting to
    // DEFAULT_BRANCH_ID, which would silently broadcast to the wrong branch
    // room for every branch other than the default.
    await this.gateway.broadcastState(loc.branchId ?? branchId ?? undefined);
    return loc;
  }

  // -- Kiosk Issuing ---------------------------------------------------------

  @Get('locations/:id/next-token')
  @Public() // Kiosk is public
  async getNextTokenToIssue(@Param('id') id: string) {
    const nextToken = await this.tokenService.getNextTokenToIssue(id);
    return { nextToken };
  }

  @Post('locations/:id/issue')
  @RequirePermissions('TOKEN:ISSUE:MANUAL') // GAP-19: staff/receptionist manual issue
  async issueToken(
    @Param('id') id: string,
    @Body() body?: IssueTokenDto,
  ) {
    const { tokenNumber, branchId, fullToken, tokenPrefix } = await this.tokenService.issueToken(id, body ?? {});
    this.gateway.broadcastTokenIssued(id, tokenNumber, branchId);
    // Force a state broadcast so operators get the updated issuedCount too
    await this.gateway.broadcastState(branchId ?? undefined);
    return { tokenNumber, fullToken, tokenPrefix };
  }

  // -- Display media (upload / list / delete) --------------------------------

  private get _uploadDir(): string {
    return path.join(process.cwd(), 'uploads', 'display-media');
  }

  /** Upload an image or video file for use in the canvas builder. */
  @Post('media/upload')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  async uploadMedia(@Request() req: any): Promise<{ url: string; filename: string; originalName: string; mimeType: string; size: number }> {
    const ALLOWED = new Set([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'image/bmp', 'image/tiff',
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
    ]);

    // @fastify/multipart exposes req.file() on the raw request
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const data = await req.file();
    if (!data) throw new BadRequestException('No file received');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const mime: string = data.mimetype as string;
    if (!ALLOWED.has(mime)) {
      throw new BadRequestException(`File type "${mime}" is not allowed`);
    }

    // Build a collision-free filename: timestamp + random + original extension
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const originalName: string = data.filename as string;
    const ext = path.extname(originalName).toLowerCase() || `.${mime.split('/')[1]}`;
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;

    // Buffer the incoming multipart stream (the storage facade's storeFile()
    // takes a Buffer, not a stream), then hand the raw write off to the
    // storage abstraction -- same "uploads/display-media/" directory, same
    // generated filename, same bytes on disk as the old direct fs write.
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    for await (const chunk of data.file as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    await this.objectRepository.storeFile(fileBuffer, `display-media/${safeName}`, mime, undefined, tenantId);

    return {
      url:          `/uploads/display-media/${safeName}`,
      filename:     safeName,
      originalName,
      mimeType:     mime,
      size:         fileBuffer.length,
    };
  }

  /** List all previously uploaded display media files. */
  @Get('media/list')
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  listMedia(): Array<{ filename: string; url: string; size: number; uploadedAt: string }> {
    const dir = this._uploadDir;
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const stat = fs.statSync(path.join(dir, f));
        return {
          filename:   f,
          url:        `/uploads/display-media/${f}`,
          size:       stat.size,
          uploadedAt: stat.birthtime.toISOString(),
        };
      })
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  /** Delete an uploaded display media file. */
  @Delete('media/:filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:LOCATION:MANAGE')
  async deleteMedia(@Param('filename') filename: string): Promise<void> {
    const filepath = path.join(this._uploadDir, filename);
    if (!fs.existsSync(filepath)) throw new NotFoundException('File not found');
    await this.objectRepository.deleteFile(`display-media/${filename}`);
  }
}

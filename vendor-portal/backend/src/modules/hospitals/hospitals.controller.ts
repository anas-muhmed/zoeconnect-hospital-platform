import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, Request, HttpCode,
} from '@nestjs/common';
import { HospitalsService, ApproveRequestDto, RevokeDto } from './hospitals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class HospitalsController {
  constructor(private readonly svc: HospitalsService) {}

  // ── Public: called by ZoeConnect instances ─────────────────────────────────────────

  @Public()
  @Post('hospitals/forgot-password')
  async receivePasswordResetRequest(@Body() body: any, @Request() req: any) {
    const instanceToken = req.headers['x-instance-token'];
    return this.svc.receivePasswordResetRequest(instanceToken, body);
  }

  /** POST /api/hospitals/register — called by ZoeConnect on first boot */
  @Public()
  @Post('hospitals/register')
  register(@Body() body: {
    hospitalName: string; hospitalCode: string;
    publicIp: string; publicPort: number;
    webhookUrl: string; machineFingerprint: string;
  }) {
    return this.svc.register(body);
  }

  /** POST /api/hospitals/provision-cloud — called by orchestrator/admin to provision cloud tenant */
  @UseGuards(JwtAuthGuard)
  @Post('hospitals/provision-cloud')
  provisionCloudTenant(@Body() body: {
    hospitalName: string; hospitalCode: string;
    publicIp: string; publicPort: number;
    provisioningSecret: string;
  }) {
    return this.svc.provisionCloudTenant(body);
  }

  /** POST /api/requests — hospital submits a license request */
  @Public()
  @Post('requests')
  createRequest(
    @Body() body: {
      instanceToken:      string;
      requestedModules:   string[];
      currentModules:     string[];
      remarks?:           string;
      machineFingerprint: string;
      isTrial:            boolean;
      expiresAt?:         string | null;
    },
  ) {
    const { instanceToken, ...rest } = body;
    return this.svc.createRequest(instanceToken, rest);
  }

  // ── Vendor-authenticated endpoints ────────────────────────────────────────────

  /** GET /api/hospitals */
  @UseGuards(JwtAuthGuard)
  @Get('hospitals')
  findAll() {
    return this.svc.findAll();
  }

  /** GET /api/hospitals/:id */
  @UseGuards(JwtAuthGuard)
  @Get('hospitals/:id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  /** PATCH /api/hospitals/:id/notes */
  @UseGuards(JwtAuthGuard)
  @Patch('hospitals/:id/notes')
  updateNotes(@Param('id') id: string, @Body('notes') notes: string) {
    return this.svc.updateNotes(id, notes);
  }

  /** PATCH /api/hospitals/:id/suspend */
  @UseGuards(JwtAuthGuard)
  @Patch('hospitals/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.svc.suspend(id);
  }

  /** PATCH /api/hospitals/:id/activate */
  @UseGuards(JwtAuthGuard)
  @Patch('hospitals/:id/activate')
  activate(@Param('id') id: string) {
    return this.svc.activate(id);
  }

  /** PATCH /api/hospitals/:id/extend-trial */
  @UseGuards(JwtAuthGuard)
  @Patch('hospitals/:id/extend-trial')
  extendTrial(
    @Param('id') id: string,
    @Body() body: { newExpiresAt: string; reason: string },
    @Request() req: any,
  ) {
    return this.svc.extendTrial(id, body.newExpiresAt, body.reason, req.user.id);
  }

  /** POST /api/hospitals/:id/revoke */
  @UseGuards(JwtAuthGuard)
  @Post('hospitals/:id/revoke')
  @HttpCode(200)
  revoke(@Param('id') id: string, @Body() dto: RevokeDto, @Request() req: any) {
    return this.svc.revokeHospital(id, dto, req.user.id);
  }

  /** GET /api/hospitals/:id/licenses */
  @UseGuards(JwtAuthGuard)
  @Get('hospitals/:id/licenses')
  getHospitalLicenses(@Param('id') id: string) {
    return this.svc.findHospitalLicenses(id);
  }

  // ── Requests ──────────────────────────────────────────────────────────────────

  /** GET /api/requests?status=PENDING */
  @UseGuards(JwtAuthGuard)
  @Get('requests')
  findAllRequests(@Query('status') status?: string) {
    return this.svc.findAllRequests(status);
  }

  /** GET /api/requests/:id */
  @UseGuards(JwtAuthGuard)
  @Get('requests/:id')
  findRequest(@Param('id') id: string) {
    return this.svc.findRequest(id);
  }

  /** POST /api/requests/:id/approve */
  @UseGuards(JwtAuthGuard)
  @Post('requests/:id/approve')
  @HttpCode(200)
  approveRequest(
    @Param('id') id: string,
    @Body() dto: ApproveRequestDto,
    @Request() req: any,
  ) {
    return this.svc.approveRequest(id, dto, req.user.id);
  }

  /** POST /api/requests/:id/reject */
  @UseGuards(JwtAuthGuard)
  @Post('requests/:id/reject')
  @HttpCode(200)
  rejectRequest(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.svc.rejectRequest(id, reason, req.user.id);
  }

  // ── Licenses ──────────────────────────────────────────────────────────────────

  /** GET /api/licenses — active only */
  @UseGuards(JwtAuthGuard)
  @Get('licenses')
  findActiveLicenses() {
    return this.svc.findActiveLicenses();
  }

  /** GET /api/licenses/history — all licenses (active + revoked + expired) */
  @UseGuards(JwtAuthGuard)
  @Get('licenses/history')
  findAllLicenses() {
    return this.svc.findAllLicenses();
  }

  /** GET /api/revocations — all revocation events with webhook status */
  @UseGuards(JwtAuthGuard)
  @Get('revocations')
  findAllRevocations() {
    return this.svc.findAllRevocations();
  }

  // ── HIS Schema Config ────────────────────────────────────────────────────

  /** GET /api/hospitals/:id/his-config — full config list with defaults */
  @UseGuards(JwtAuthGuard)
  @Get('hospitals/:id/his-config')
  getHisConfig(@Param('id') id: string) {
    return this.svc.getHisConfig(id);
  }

  /** PATCH /api/hospitals/:id/his-config — save one or more key/value pairs */
  @UseGuards(JwtAuthGuard)
  @Patch('hospitals/:id/his-config')
  updateHisConfig(
    @Param('id') id: string,
    @Body() body: { updates: Array<{ configKey: string; configValue: string }> },
  ) {
    return this.svc.updateHisConfig(id, body.updates);
  }

  /** GET /api/hospitals/:id/sync-his-config — pull live HIS SQL from the running ZoeConnect instance */
  @UseGuards(JwtAuthGuard)
  @Get('hospitals/:id/sync-his-config')
  syncHisConfig(@Param('id') id: string) {
    return this.svc.syncHisConfig(id);
  }

  /** POST /api/hospitals/:id/push-his-config — deliver config to ZoeConnect via webhook */
  @UseGuards(JwtAuthGuard)
  @Post('hospitals/:id/push-his-config')
  @HttpCode(200)
  pushHisConfig(@Param('id') id: string) {
    return this.svc.pushHisConfig(id);
  }

  /**
   * POST /api/hospitals/:id/test-db-connection
   * Proxies to the ZoeConnect instance's oracle test endpoint using the saved db.* credentials.
   * Returns { ok: boolean; message: string }.
   */
  @UseGuards(JwtAuthGuard)
  @Post('hospitals/:id/test-db-connection')
  @HttpCode(200)
  testDbConnection(@Param('id') id: string) {
    return this.svc.testDbConnection(id);
  }

  // ── HIS Config Templates ─────────────────────────────────────────────────

  /** GET /api/his-config-templates — list all saved templates */
  @UseGuards(JwtAuthGuard)
  @Get('his-config-templates')
  listTemplates() {
    return this.svc.listTemplates();
  }

  /** GET /api/his-config-templates/:id — single template with full SQL */
  @UseGuards(JwtAuthGuard)
  @Get('his-config-templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.svc.getTemplate(id);
  }

  /**
   * POST /api/his-config-templates
   * Body: { hospitalId, name, description? }
   * Captures current sql.* values from the hospital and saves as a named template.
   */
  @UseGuards(JwtAuthGuard)
  @Post('his-config-templates')
  createTemplate(
    @Body() body: { hospitalId: string; name: string; description?: string },
  ) {
    return this.svc.createTemplate(body.hospitalId, body.name, body.description ?? null);
  }

  /** DELETE /api/his-config-templates/:id */
  @UseGuards(JwtAuthGuard)
  @Delete('his-config-templates/:id')
  @HttpCode(204)
  deleteTemplate(@Param('id') id: string) {
    return this.svc.deleteTemplate(id);
  }

  /**
   * POST /api/hospitals/:id/his-config/apply-template
   * Body: { templateId }
   * Overwrites the hospital's sql.* config keys with the template's stored SQL.
   */
  @UseGuards(JwtAuthGuard)
  @Post('hospitals/:id/his-config/apply-template')
  @HttpCode(200)
  applyTemplate(
    @Param('id') id: string,
    @Body() body: { templateId: string },
  ) {
    return this.svc.applyTemplate(id, body.templateId);
  }

  // ── ZoeConnect User Credentials ─────────────────────────────────────────────────

  /** GET /api/hospitals/:id/hdsp-users */
  @UseGuards(JwtAuthGuard)
  @Get('hospitals/:id/hdsp-users')
  listHdspUsers(@Param('id') id: string) {
    return this.svc.listHdspUsers(id);
  }

  /** POST /api/hospitals/:id/hdsp-users — create a new ZoeConnect login credential */
  @UseGuards(JwtAuthGuard)
  @Post('hospitals/:id/hdsp-users')
  createHdspUser(
    @Param('id') id: string,
    @Body() body: { username: string; password: string; role: 'ADMIN' | 'STAFF'; fullName?: string },
  ) {
    return this.svc.createHdspUser(id, body);
  }

  /** PATCH /api/hdsp-users/:userId — update role / fullName / isActive / password */
  @UseGuards(JwtAuthGuard)
  @Patch('hdsp-users/:userId')
  updateHdspUser(
    @Param('userId') userId: string,
    @Body() body: { role?: 'ADMIN' | 'STAFF'; fullName?: string; isActive?: boolean; password?: string },
  ) {
    return this.svc.updateHdspUser(userId, body);
  }

  /** DELETE /api/hdsp-users/:userId */
  @UseGuards(JwtAuthGuard)
  @Delete('hdsp-users/:userId')
  @HttpCode(204)
  deleteHdspUser(@Param('userId') userId: string) {
    return this.svc.deleteHdspUser(userId);
  }

  // ── Delete Hospital ───────────────────────────────────────────────────────

  /** DELETE /api/hospitals/:id — permanently removes hospital + all related data */
  @UseGuards(JwtAuthGuard)
  @Delete('hospitals/:id')
  @HttpCode(204)
  deleteHospital(@Param('id') id: string) {
    return this.svc.deleteHospital(id);
  }

  // ── System Settings ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('hospitals/:id/system-settings')
  getSystemSettings(@Param('id') id: string) {
    return this.svc.getSystemSettings(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('hospitals/:id/system-settings')
  async updateSystemSettings(
    @Param('id') id: string,
    @Body() body: { updates: Array<{ settingKey: string; settingValue: string; label: string; description?: string }> },
  ) {
    for (const u of body.updates) {
      await this.svc.upsertSystemSetting(id, u.settingKey, u.settingValue, u.label, u.description);
    }
    return { ok: true, message: 'Settings saved' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('hospitals/:id/push-system-settings')
  @HttpCode(200)
  pushSystemSettings(@Param('id') id: string) {
    return this.svc.pushSystemSettings(id);
  }
}

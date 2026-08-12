import { Controller, Get, Post, Patch, Delete, Param, Body, Request, Query, UseGuards, UseInterceptors, ParseUUIDPipe, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import type { User } from '../../users/entities/user.entity';
import { FeedbackFormService } from './feedback-form.service';
import { FeedbackSettingsService } from '../settings/feedback-settings.service';
import { CreateFeedbackFormDto, UpdateFeedbackFormDto } from '../dto/feedback-form.dto';
import { ObjectRepositoryService } from '../../platform/services/object-repository/services/object-repository.service';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

/**
 * Patient Feedback & Experience Management -- Phase 1 (Foundation: Form
 * Builder), plus the header logo/banner upload added on top of it.
 * Admin-only CRUD for form definitions; nothing here is reachable without
 * authentication -- the public, no-login submission portal lives separately
 * in FeedbackPublicController (Phase 2), unguarded.
 * Audit logging happens inside FeedbackFormService itself (direct calls to
 * FeedbackAuditService), not via the shared `@Audit()` decorator -- see the
 * doc comment on FeedbackAuditLog for why that mechanism is skipped.
 * Header image upload follows the same `@fastify/multipart` + manual
 * `req.file()` pattern as CmsMediaController.upload -- see main.ts for the
 * matching static-file registration.
 */
@ApiTags('Feedback Forms')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/forms')
export class FeedbackFormController {
  constructor(
    private readonly formService: FeedbackFormService,
    private readonly settingsService: FeedbackSettingsService,
    private readonly objectRepository: ObjectRepositoryService,
  ) {}

  @Get()
  @RequirePermissions('FEEDBACK:FORM:VIEW')
  @ApiOperation({ summary: 'List feedback forms for the active branch' })
  list(@ActiveBranchId() branchId: string) {
    return this.formService.list(branchId);
  }

  @Get(':id')
  @RequirePermissions('FEEDBACK:FORM:VIEW')
  @ApiOperation({ summary: 'Get a form with its full section/question/option/condition tree' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.formService.findOne(id);
  }

  @Post()
  @RequirePermissions('FEEDBACK:FORM:CREATE')
  @ApiOperation({ summary: 'Create a new feedback form (starts as DRAFT)' })
  create(@Body() dto: CreateFeedbackFormDto, @CurrentUser() actor: User, @ActiveBranchId() branchId: string) {
    return this.formService.create({ ...dto, branchId }, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Update form name/description/language/status' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeedbackFormDto, @CurrentUser() actor: User) {
    return this.formService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('FEEDBACK:FORM:DELETE')
  @ApiOperation({ summary: 'Delete a form (must be unpublished first)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.formService.remove(id);
  }

  @Post(':id/publish')
  @RequirePermissions('FEEDBACK:FORM:PUBLISH')
  @ApiOperation({ summary: 'Publish a form (requires at least one section with a question)' })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.formService.publish(id, actor.id);
  }

  @Post(':id/unpublish')
  @RequirePermissions('FEEDBACK:FORM:PUBLISH')
  @ApiOperation({ summary: 'Revert a published form back to DRAFT' })
  unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.formService.unpublish(id, actor.id);
  }

  @Post(':id/archive')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Archive a form' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.formService.archive(id, actor.id);
  }

  @Post(':id/clone')
  @RequirePermissions('FEEDBACK:FORM:CREATE')
  @ApiOperation({ summary: 'Deep-clone a form (sections, questions, options, conditions) as a new DRAFT' })
  clone(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.formService.clone(id, actor.id);
  }

  // -- Header image (hospital logo/banner) + splash screen --------------------------
  // Both allowed even on a PUBLISHED form -- see FeedbackFormService.setHeaderImage's
  // doc comment for why branding is exempt from the "published forms are frozen" rule.

  private get _uploadDir(): string {
    return path.join(process.cwd(), 'uploads', 'feedback-media');
  }

  /** Shared multipart-save logic behind header-image and splash-image upload -- streams the file to uploads/feedback-media/, returns its public URL. */
  private async _saveUploadedImage(id: string, req: any, prefix: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const data = await req.file();
    if (!data) throw new BadRequestException('No file received');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const mime: string = data.mimetype as string;
    if (!ALLOWED_IMAGE_TYPES.has(mime)) {
      throw new BadRequestException(`File type "${mime}" is not allowed`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const originalName: string = data.filename as string;
    const ext = path.extname(originalName).toLowerCase() || `.${mime.split('/')[1]}`;
    const safeName = `${prefix}-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;

    // Buffer the incoming multipart stream (the storage facade's storeFile()
    // takes a Buffer, not a stream), then hand the raw write off to the
    // storage abstraction -- same "uploads/feedback-media/" directory, same
    // generated filename, same bytes on disk as the old direct fs write.
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    for await (const chunk of data.file as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    await this.objectRepository.storeFile(fileBuffer, `feedback-media/${safeName}`, mime);

    return `/uploads/feedback-media/${safeName}`;
  }

  private async _deleteUploadedImage(url: string | null): Promise<void> {
    if (!url) return;
    const filename = path.basename(url);
    const oldPath = path.join(this._uploadDir, filename);
    if (fs.existsSync(oldPath)) await this.objectRepository.deleteFile(`feedback-media/${filename}`);
  }

  @Post(':id/header-image')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Upload a hospital logo/banner for this form (?type=LOGO|BANNER, default LOGO)' })
  async uploadHeaderImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @CurrentUser() actor: User,
    @Query('type') type?: string,
  ) {
    const headerType = type === 'BANNER' ? 'BANNER' : 'LOGO';
    const url = await this._saveUploadedImage(id, req, 'header');

    // Replacing a header image shouldn't leave the old file behind on disk.
    const existing = await this.formService.findOne(id);
    await this._deleteUploadedImage(existing.headerImageUrl);

    return this.formService.setHeaderImage(id, { url, type: headerType }, actor.id);
  }

  @Delete(':id/header-image')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Remove this form\'s header logo/banner' })
  async removeHeaderImage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    const existing = await this.formService.findOne(id);
    await this._deleteUploadedImage(existing.headerImageUrl);
    return this.formService.removeHeaderImage(id, actor.id);
  }

  @Post(':id/splash-image')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Upload a full-screen splash image shown before the form on the public portal (?durationSeconds=1-15, default 3)' })
  async uploadSplashImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @CurrentUser() actor: User,
    @Query('durationSeconds') durationSecondsRaw?: string,
  ) {
    const existing = await this.formService.findOne(id);
    const settings = await this.settingsService.get(existing.branchId ?? null);

    const parsed = Number(durationSecondsRaw);
    const durationSeconds = Number.isFinite(parsed)
      ? Math.min(settings.maxSplashDurationSeconds, Math.max(settings.minSplashDurationSeconds, Math.round(parsed)))
      : settings.defaultSplashDurationSeconds;

    const url = await this._saveUploadedImage(id, req, 'splash');

    await this._deleteUploadedImage(existing.splashImageUrl);

    return this.formService.setSplashImage(id, { url, durationSeconds }, actor.id);
  }

  @Delete(':id/splash-image')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Remove this form\'s splash screen' })
  async removeSplashImage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    const existing = await this.formService.findOne(id);
    await this._deleteUploadedImage(existing.splashImageUrl);
    return this.formService.removeSplashImage(id, actor.id);
  }
}

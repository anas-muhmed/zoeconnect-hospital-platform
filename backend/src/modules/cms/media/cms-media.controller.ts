import {
  Controller, Get, Post, Delete, Param, Query, Request,
  UseGuards, UseInterceptors, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId }     from '../../../common/decorators/active-branch.decorator';
import { CmsMediaService } from './cms-media.service';
import { CmsMediaType } from '../entities/cms-media.entity';
import { readImageDimensions } from './image-dimensions.util';
import { CmsAuditService } from '../audit/cms-audit.service';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { ObjectRepositoryService } from '../../platform/services/object-repository/services/object-repository.service';

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']);
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);

@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('cms/media')
export class CmsMediaController {
  constructor(
    private readonly mediaService: CmsMediaService,
    private readonly auditService: CmsAuditService,
    private readonly objectRepository: ObjectRepositoryService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  private get _uploadDir(): string {
    return path.join(process.cwd(), 'uploads', 'cms-media');
  }

  private _userId(req: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('CMS:MEDIA:MANAGE')
  async upload(@Request() req: any, @ActiveBranchId() branchId: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const data = await req.file();
    if (!data) throw new BadRequestException('No file received');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const mime: string = data.mimetype as string;
    let mediaType: CmsMediaType;
    if (ALLOWED_IMAGE.has(mime)) mediaType = 'IMAGE';
    else if (ALLOWED_VIDEO.has(mime)) mediaType = 'VIDEO';
    else throw new BadRequestException(`File type "${mime}" is not allowed`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const originalName: string = data.filename as string;
    const ext = path.extname(originalName).toLowerCase() || `.${mime.split('/')[1]}`;
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;

    // Buffer the incoming multipart stream (the storage facade's storeFile()
    // takes a Buffer, not a stream) then hand the raw write off to the
    // storage abstraction -- same "uploads/cms-media/" directory, same
    // generated filename, same bytes on disk as the old direct fs write.
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    for await (const chunk of data.file as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    await this.objectRepository.storeFile(fileBuffer, `cms-media/${safeName}`, mime, undefined, tenantId);

    const url = `/uploads/cms-media/${safeName}`;

    // Metadata: checksum always; width/height for recognized image formats only.
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const dimensions = mediaType === 'IMAGE' ? readImageDimensions(fileBuffer) : null;

    const userId = this._userId(req);

    const media = await this.mediaService.create({
      branchId,
      filename: safeName,
      originalName,
      url,
      mimeType: mime,
      mediaType,
      size: fileBuffer.length,
      uploadedBy: userId,
      checksum,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    });

    await this.auditService.log({
      entityType: 'CMSMedia', entityId: media.id, action: 'CREATE',
      changedBy: userId, branchId, summary: `Uploaded "${originalName}" (${mediaType})`,
    });

    return media;
  }

  @Get()
  @RequirePermissions('CMS:MEDIA:MANAGE')
  list(@ActiveBranchId() branchId: string, @Query('includeDeleted') includeDeleted?: string) {
    return this.mediaService.list(branchId, includeDeleted === 'true');
  }

  @Get(':id/usage')
  @RequirePermissions('CMS:MEDIA:MANAGE')
  usage(@Param('id') id: string) {
    return this.mediaService.getUsage(id);
  }

  /** Soft delete -- hides from the library, keeps the file and row so it can be restored. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('CMS:MEDIA:MANAGE')
  async remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    const media = await this.mediaService.remove(id);
    await this.auditService.log({
      entityType: 'CMSMedia', entityId: id, action: 'DELETE',
      changedBy: this._userId(req), summary: `Deleted "${media.originalName}" (soft delete, recoverable)`,
    });
  }

  @Post(':id/restore')
  @RequirePermissions('CMS:MEDIA:MANAGE')
  async restore(@Param('id') id: string, @Request() req: any) {
    const media = await this.mediaService.restore(id);
    await this.auditService.log({
      entityType: 'CMSMedia', entityId: id, action: 'RESTORE',
      changedBy: this._userId(req), summary: `Restored "${media.originalName}"`,
    });
    return media;
  }

  /** Permanent delete -- refuses if still referenced by any playlist; also removes the file on disk. */
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('CMS:MEDIA:MANAGE')
  async permanentDelete(@Param('id') id: string, @Request() req: any): Promise<void> {
    const media = await this.mediaService.permanentDelete(id);
    const filepath = path.join(this._uploadDir, media.filename);
    if (fs.existsSync(filepath)) await this.objectRepository.deleteFile(`cms-media/${media.filename}`);
    await this.auditService.log({
      entityType: 'CMSMedia', entityId: id, action: 'PERMANENT_DELETE',
      changedBy: this._userId(req), summary: `Permanently deleted "${media.originalName}"`,
    });
  }
}

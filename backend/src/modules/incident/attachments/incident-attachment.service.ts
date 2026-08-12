import {
  Injectable, Logger, Inject, NotFoundException,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as path from 'path';
import { IncidentAttachment } from '../entities/incident-attachment.entity';
import { IncidentService } from '../incidents/incident.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { STORAGE_PROVIDER } from '../../platform/infrastructure/tokens';
import type { IObjectStorageProvider } from '../../platform/services/object-repository/interfaces/object-storage-provider.interface';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import type { User } from '../../users/entities/user.entity';
import { ANTI_VIRUS_PROVIDER, type IAntiVirusProvider } from './anti-virus.provider';

// ── MIME allowlist ────────────────────────────────────────────────────────────
// Hospital-grade: images, common office docs, PDF, audio/video evidence,
// DICOM medical imaging, and structured data formats.
export const ALLOWED_MIME_TYPES = new Set<string>([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/tiff',
  // PDF
  'application/pdf',
  // Microsoft Word
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Microsoft Excel
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Microsoft PowerPoint
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text / structured data
  'text/plain', 'text/csv',
  'application/json',
  'application/xml', 'text/xml',
  // DICOM medical imaging
  'application/dicom', 'application/dicom+json',
  // Audio / video evidence
  'video/mp4', 'video/mpeg', 'audio/mpeg', 'audio/wav',
]);

// Default 25 MB — override via INCIDENT_ATTACHMENT_MAX_SIZE_MB env var
const DEFAULT_MAX_MB = 25;

@Injectable()
export class IncidentAttachmentService {
  private readonly logger = new Logger(IncidentAttachmentService.name);
  private readonly maxSizeBytes: number;

  constructor(
    @InjectRepository(IncidentAttachment)
    private readonly repo: Repository<IncidentAttachment>,
    private readonly incidentService: IncidentService,
    private readonly timeline: IncidentTimelineService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: IObjectStorageProvider,
    private readonly tenantContext: TenantContextStorage,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(ANTI_VIRUS_PROVIDER)
    private readonly av: IAntiVirusProvider,
  ) {
    const maxMb = this.config.get<number>('INCIDENT_ATTACHMENT_MAX_SIZE_MB', DEFAULT_MAX_MB);
    this.maxSizeBytes = maxMb * 1024 * 1024;
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  async upload(
    incidentId: string,
    parentType: string,
    parentId: string,
    file: Express.Multer.File,
    actor: User,
  ): Promise<IncidentAttachment> {
    // 1. Validate incident exists in tenant scope
    await this.incidentService.findOne(incidentId);

    // 2. MIME type guard
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. ` +
        `Permitted types: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    // 3. Size guard (configurable)
    if (file.size > this.maxSizeBytes) {
      const maxMb = Math.round(this.maxSizeBytes / 1024 / 1024);
      throw new BadRequestException(
        `File size ${file.size} bytes exceeds the maximum of ${maxMb} MB`,
      );
    }

    // 4. Filename sanitization — strip traversal characters; keep only the basename
    const safeOriginalName = path
      .basename(file.originalname)
      .replace(/[/\\?%*:|"<>\x00]/g, '_')
      .slice(0, 255) || 'file';

    // 5. Antivirus scan (no-op by default; swap provider for real AV)
    await this.av.scan(file.buffer, safeOriginalName, file.mimetype);

    // 6. Generate a UUID-based object key so the filename is never part of the storage path
    const ext = path.extname(safeOriginalName) || '';
    const objectKey = `${crypto.randomUUID()}${ext}`;

    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    // 7. Upload to storage using the generated key
    const storageKey = await this.storage.upload(
      file.buffer,
      objectKey,          // key — NOT the original filename
      file.mimetype,
      { module: 'incident', incidentId, originalName: safeOriginalName },
      tenantId,
    );

    // 8. Derive attachment type from MIME
    let attachmentType = 'document';
    if (file.mimetype.startsWith('image/'))           attachmentType = 'image';
    else if (file.mimetype.startsWith('video/'))      attachmentType = 'video';
    else if (file.mimetype.startsWith('audio/'))      attachmentType = 'audio';
    else if (file.mimetype === 'application/dicom' ||
             file.mimetype === 'application/dicom+json') attachmentType = 'dicom';

    // 9. Persist metadata (originalName is a display label only — not a storage path)
    const attachment = this.repo.create({
      tenantId,
      incidentId,
      parentType,
      parentId,
      storageKey,
      thumbnailKey: null,
      originalName: safeOriginalName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      attachmentType,
      uploadedById: actor.id,
    });

    const saved = await this.repo.save(attachment);

    await this.timeline.emit({
      incidentId,
      eventType: 'ATTACHMENT_ADDED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Uploaded file: ${safeOriginalName}`,
      metadata: { attachmentId: saved.id, parentType, parentId },
    });

    return saved;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async getForIncident(incidentId: string): Promise<IncidentAttachment[]> {
    return this.repo.find({ where: { incidentId }, order: { createdAt: 'DESC' } });
  }

  async getForParent(parentType: string, parentId: string): Promise<IncidentAttachment[]> {
    return this.repo.find({ where: { parentType, parentId }, order: { createdAt: 'DESC' } });
  }

  // ── Download ───────────────────────────────────────────────────────────────

  async download(id: string): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const attachment = await this.findAndAuthorize(id);
    const buffer = await this.storage.download(attachment.storageKey);
    return { buffer, mimeType: attachment.mimeType, originalName: attachment.originalName };
  }

  async getPresignedUrl(id: string): Promise<{ url: string }> {
    const attachment = await this.findAndAuthorize(id);
    const url = await this.storage.getPresignedDownloadUrl(attachment.storageKey, 3600);
    return { url };
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(id: string, actor: User): Promise<void> {
    const attachment = await this.findAndAuthorize(id);

    // Delete from storage (best effort — never block DB cleanup)
    try {
      await this.storage.delete(attachment.storageKey);
      if (attachment.thumbnailKey) {
        await this.storage.delete(attachment.thumbnailKey);
      }
    } catch (e) {
      this.logger.error(
        `Failed to delete object ${attachment.storageKey} from storage: ${e.message}. ` +
        `Proceeding with DB record deletion.`,
      );
    }

    await this.repo.delete(id);

    await this.timeline.emit({
      incidentId: attachment.incidentId,
      eventType: 'ATTACHMENT_DELETED',
      actorId: actor.id,
      actorName: actor.fullName ?? actor.username,
      description: `Deleted file: ${attachment.originalName}`,
      metadata: { attachmentId: id },
    });

    await this.audit.log({
      action: 'ATTACHMENT_DELETED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'IncidentAttachment',
      entityId: id,
      oldValue: { originalName: attachment.originalName } as Record<string, unknown>,
    });
  }

  // ── Authorization Helper ───────────────────────────────────────────────────

  /**
   * Find an attachment and verify the caller's tenant matches.
   * Returns 404 (not 403) so tenant existence is not leaked to other tenants.
   */
  private async findAndAuthorize(id: string): Promise<IncidentAttachment> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const attachment = await this.repo.findOne({ where: { id } });

    if (!attachment) {
      throw new NotFoundException(`Attachment ${id} not found`);
    }

    // Null tenantId on the attachment means it's a system/global record — accessible to all
    if (attachment.tenantId !== null && attachment.tenantId !== tenantId) {
      // Return 404 — same as "not found" — to avoid cross-tenant enumeration
      throw new NotFoundException(`Attachment ${id} not found`);
    }

    return attachment;
  }
}

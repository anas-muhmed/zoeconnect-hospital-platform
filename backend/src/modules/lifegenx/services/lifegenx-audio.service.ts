import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ObjectRepositoryService } from '../../platform/services/object-repository/services/object-repository.service';

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.webm']);

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
};

export interface UploadedAudioResult {
  audioId: string;
  fileName: string;
  duration: string;
  size: string;
  objectKey: string;
  url: string;
}

export interface RetrievedAudio {
  buffer: Buffer;
  mimeType: string;
}

/**
 * LifeGenX integration (delivery phase, security fix). Ports
 * `controllers/audio.controller.ts` + `middlewares/upload.middleware.ts`.
 *
 * Security fix (whole-system audit, Step 10): audio was previously
 * exposed via an unauthenticated Fastify-static route with a
 * tenant-unaware object key — any caller who obtained or guessed a URL
 * could retrieve another tenant's patient consultation recording with
 * zero authentication. Fixed here, narrowly, without touching the shared
 * storage system:
 *
 *  1. The object key is now tenant-prefixed
 *     (`lifegenx-audio/<tenantId>/<filename>`) — a LifeGenX-owned naming
 *     decision (the key string is entirely under this service's
 *     control), not a change to `ObjectRepositoryService` or
 *     `LocalStorageProvider` themselves.
 *  2. The static `/uploads/lifegenx-audio/` mount is removed from
 *     `main.ts`. Retrieval now goes through `retrieve()` below, called
 *     only from an authenticated, permission-gated controller route
 *     (`LifeGenXAudioController.download`), which checks the requested
 *     tenant segment against the caller's own `tenantId` before ever
 *     touching storage.
 */
@Injectable()
export class LifeGenXAudioService {
  constructor(private readonly objectRepository: ObjectRepositoryService) {}

  async store(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    tenantId: string,
  ): Promise<UploadedAudioResult> {
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) && !mimeType.startsWith('audio/')) {
      throw new BadRequestException('Invalid audio file format. Only mp3, wav, m4a, ogg, and webm are supported.');
    }
    if (buffer.byteLength > 25 * 1024 * 1024) {
      throw new BadRequestException('Audio file exceeds the 25MB limit.');
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `audio-${uniqueSuffix}${ext}`;
    const objectKey = `lifegenx-audio/${tenantId}/${filename}`;

    await this.objectRepository.storeFile(buffer, objectKey, mimeType, undefined, tenantId);

    const audioId = path.parse(filename).name;
    const estimatedSeconds = Math.max(12, Math.round(buffer.byteLength / 30000));
    const minutes = Math.floor(estimatedSeconds / 60);
    const seconds = estimatedSeconds % 60;
    const duration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    const sizeInMB = (buffer.byteLength / (1024 * 1024)).toFixed(2);

    return {
      audioId,
      fileName: originalName,
      duration,
      size: `${sizeInMB} MB`,
      objectKey,
      // Authenticated retrieval route, not the (now-removed) static mount.
      url: `/api/v1/lifegenx/audio/${tenantId}/${filename}`,
    };
  }

  /**
   * Ownership check + retrieval. `requestedTenantId` comes from the URL
   * path (`GET /lifegenx/audio/:tenantId/:filename`); `callerTenantId`
   * comes from the authenticated caller's own `tenantId`. These must
   * match before storage is ever touched — the actual tenant isolation
   * enforcement point for this endpoint.
   */
  async retrieve(requestedTenantId: string, callerTenantId: string, filename: string): Promise<RetrievedAudio> {
    if (requestedTenantId !== callerTenantId) {
      throw new ForbiddenException('You are not authorized to access this audio file.');
    }
    const ext = path.extname(filename).toLowerCase();
    const objectKey = `lifegenx-audio/${requestedTenantId}/${filename}`;
    try {
      const buffer = await this.objectRepository.getFile(objectKey);
      return { buffer, mimeType: MIME_BY_EXT[ext] || 'application/octet-stream' };
    } catch {
      throw new NotFoundException('Audio file not found.');
    }
  }

  /**
   * Ports the source's own approach: `/ai/transcribe` receives only an
   * `audioId` (the filename minus extension), not a full path, so it scans
   * the upload directory for a matching file — now scoped to the caller's
   * own tenant subdirectory. Reads directly off the local filesystem
   * rather than through `ObjectRepositoryService` — same limitation the
   * source had (assumes local disk); documented, not fixed, since AI
   * transcription only makes sense with the local storage driver in this
   * delivery pass.
   */
  findFilePathByAudioId(tenantId: string, audioId: string): string | null {
    const dir = path.join(process.cwd(), 'uploads', 'lifegenx-audio', tenantId);
    if (!fs.existsSync(dir)) return null;
    const match = fs.readdirSync(dir).find((f) => f.includes(audioId));
    return match ? path.join(dir, match) : null;
  }
}

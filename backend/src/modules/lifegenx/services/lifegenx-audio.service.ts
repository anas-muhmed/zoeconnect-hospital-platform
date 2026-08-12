import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ObjectRepositoryService } from '../../platform/services/object-repository/services/object-repository.service';

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.webm']);

export interface UploadedAudioResult {
  audioId: string;
  fileName: string;
  duration: string;
  size: string;
  objectKey: string;
  url: string;
}

/** LifeGenX integration (delivery phase). Ports `controllers/audio.controller.ts` + `middlewares/upload.middleware.ts`. */
@Injectable()
export class LifeGenXAudioService {
  constructor(private readonly objectRepository: ObjectRepositoryService) {}

  async store(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    tenantId: string | null,
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
    const objectKey = `lifegenx-audio/${filename}`;

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
      url: `/uploads/${objectKey}`,
    };
  }

  /**
   * Ports the source's own approach: `/ai/transcribe` receives only an
   * `audioId` (the filename minus extension), not a full path, so it scans
   * the upload directory for a matching file. Reads directly off the local
   * filesystem rather than through `ObjectRepositoryService` — same
   * limitation the source had (assumes local disk); documented, not fixed,
   * since AI transcription only makes sense with the local storage driver
   * in this delivery pass.
   */
  findFilePathByAudioId(audioId: string): string | null {
    const dir = path.join(process.cwd(), 'uploads', 'lifegenx-audio');
    if (!fs.existsSync(dir)) return null;
    const match = fs.readdirSync(dir).find((f) => f.includes(audioId));
    return match ? path.join(dir, match) : null;
  }
}

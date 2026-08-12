import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { IObjectStorageProvider, ObjectMetadata } from '../interfaces/object-storage-provider.interface';

/**
 * Local-filesystem implementation of IObjectStorageProvider.
 *
 * Phase 2 ("Infrastructure Abstraction") seam: this replicates -- byte for
 * byte, same directory, same filename -- the raw `fs.createWriteStream` /
 * `pipeline` write logic that used to live directly in CmsMediaController,
 * TokenController, and FeedbackFormController. It introduces no new
 * behavior; it just gives that existing logic a home behind
 * IObjectStorageProvider so a future S3/Azure provider can be swapped in
 * later (Phase 3) without touching the controllers again.
 *
 * Filename convention: callers keep generating their own collision-free
 * filename (timestamp + random suffix + extension) exactly as before, and
 * keep choosing their own sub-directory (e.g. "cms-media", "display-media",
 * "feedback-media") exactly as before. They pass "<subdir>/<filename>" as
 * the `filename` argument to `upload()`. That combined string is resolved
 * under `<cwd>/uploads` (the same root every controller used) and is also
 * returned as the object ID -- the same string must be passed back into
 * `download()` / `delete()` / `getMetadata()`.
 */
@Injectable()
export class LocalStorageProvider implements IObjectStorageProvider {
  readonly id = 'local';
  readonly name = 'Local Filesystem Storage Provider';

  private readonly logger = new Logger(LocalStorageProvider.name);

  private get _rootDir(): string {
    return path.join(process.cwd(), 'uploads');
  }

  private _resolve(objectId: string): string {
    return path.join(this._rootDir, objectId);
  }

  /**
   * Writes `buffer` to `<uploads>/<filename>`, creating any missing parent
   * directories (matching every existing caller's `fs.mkdirSync(dir, {
   * recursive: true })`). Returns `filename` unchanged as the object ID.
   *
   * `tenantId` is deliberately ignored here (Phase 3): local-filesystem
   * deployments are single-tenant-per-install today, so a tenant-prefixed
   * key would just be dead path segments. Object IDs already returned by
   * this provider stay wire-compatible with every existing caller.
   */
  async upload(buffer: Buffer, filename: string, _mimeType: string, _metadata?: Record<string, string>, _tenantId?: string | null): Promise<string> {
    const destPath = this._resolve(filename);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    await fs.promises.writeFile(destPath, buffer);
    return filename;
  }

  async download(objectId: string): Promise<Buffer> {
    return fs.promises.readFile(this._resolve(objectId));
  }

  async getMetadata(objectId: string): Promise<ObjectMetadata> {
    const fullPath = this._resolve(objectId);
    const stat = await fs.promises.stat(fullPath);
    return {
      id: objectId,
      filename: path.basename(objectId),
      mimeType: '',
      sizeBytes: stat.size,
      tags: {},
      createdAt: stat.birthtime,
      updatedAt: stat.mtime,
    };
  }

  /**
   * Idempotent delete -- mirrors the existing controllers' "check existsSync,
   * then unlinkSync" pattern (a missing file is not an error here). Callers
   * that need to distinguish "was already gone" from "deleted" (e.g.
   * TokenController.deleteMedia's 404) still do their own existsSync check
   * before calling this.
   */
  async delete(objectId: string): Promise<void> {
    const fullPath = this._resolve(objectId);
    try {
      await fs.promises.unlink(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    }
  }

  async getPresignedDownloadUrl(_objectId: string, _expirationSeconds?: number): Promise<string> {
    throw new Error('LocalStorageProvider does not support pre-signed URLs; files are served as static assets.');
  }
}

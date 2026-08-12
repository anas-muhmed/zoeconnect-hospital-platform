import { Injectable, Logger } from '@nestjs/common';
import { IObjectStorageProvider } from '../interfaces/object-storage-provider.interface';

@Injectable()
export class ObjectRepositoryService {
  private readonly logger = new Logger(ObjectRepositoryService.name);
  
  // Dynamic provider selection (e.g. S3 for prod, Local for dev)
  private activeProvider: IObjectStorageProvider | null = null;

  registerProvider(provider: IObjectStorageProvider, makeActive = false) {
    if (makeActive || !this.activeProvider) {
      this.activeProvider = provider;
      this.logger.log(`Active storage provider set to: ${provider.name} (${provider.id})`);
    }
  }

  /**
   * `tenantId` (Phase 3 "Storage Providers") is passed through untouched to
   * the active provider -- see IObjectStorageProvider.upload's doc comment.
   * LocalStorageProvider ignores it; S3StorageProvider uses it as a key
   * prefix. Omitting it (existing callers not yet updated) preserves
   * today's behavior exactly.
   */
  async storeFile(buffer: Buffer, filename: string, mimeType: string, metadata?: Record<string, string>, tenantId?: string | null): Promise<string> {
    if (!this.activeProvider) throw new Error('No active storage provider');
    // Save metadata to DB
    // Save blob to provider
    return this.activeProvider.upload(buffer, filename, mimeType, metadata, tenantId);
  }

  async getFile(objectId: string): Promise<Buffer> {
    if (!this.activeProvider) throw new Error('No active storage provider');
    return this.activeProvider.download(objectId);
  }

  async deleteFile(objectId: string): Promise<void> {
    if (!this.activeProvider) throw new Error('No active storage provider');
    return this.activeProvider.delete(objectId);
  }
}

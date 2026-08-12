export interface ObjectMetadata {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  tags: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IObjectStorageProvider {
  readonly id: string; // e.g., 'local', 's3', 'azure-blob', 'gcs'
  readonly name: string;
  
  /**
   * Uploads a file buffer and returns its unique object ID.
   *
   * `tenantId` (Phase 3 "Storage Providers") is an optional key-namespacing
   * hint. Providers that don't need tenant-scoped keys (e.g.
   * LocalStorageProvider, whose files are already isolated by directory on
   * a single-tenant-per-deployment box) are free to ignore it. Providers
   * backing multi-tenant shared storage (e.g. S3StorageProvider) use it as
   * an object-key prefix so tenants can never collide or read across each
   * other's objects even under a shared bucket.
   */
  upload(buffer: Buffer, filename: string, mimeType: string, metadata?: Record<string, string>, tenantId?: string | null): Promise<string>;
  
  /**
   * Downloads a file buffer by its object ID.
   */
  download(objectId: string): Promise<Buffer>;
  
  /**
   * Retrieves metadata for an object.
   */
  getMetadata(objectId: string): Promise<ObjectMetadata>;
  
  /**
   * Deletes an object.
   */
  delete(objectId: string): Promise<void>;
  
  /**
   * Generates a pre-signed URL for direct client download.
   */
  getPresignedDownloadUrl(objectId: string, expirationSeconds?: number): Promise<string>;
}

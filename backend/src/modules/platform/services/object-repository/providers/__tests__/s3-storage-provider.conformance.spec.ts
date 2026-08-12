/**
 * Phase 3 ("Storage Providers") — S3StorageProvider conformance suite.
 *
 * Runs the SAME behavioral contract IObjectStorageProvider promises against
 * a real S3-compatible endpoint (MinIO in CI, see ci-backend.yml's
 * "storage-s3-conformance" job), not a mock. This is deliberate: mocking
 * the AWS SDK would only prove S3StorageProvider calls the SDK correctly,
 * not that upload/download/delete/getMetadata/presigned-URL round-trip
 * against a real S3 API the way LocalStorageProvider's equivalent
 * filesystem calls do.
 *
 * Gated behind RUN_S3_CONFORMANCE_TESTS=true so `npm run test` in every
 * other context (local dev, the main "Unit tests" CI step) skips this file
 * outright rather than failing for lack of a MinIO endpoint. Only the
 * dedicated CI job (which brings up a MinIO service container and sets
 * this env var + the S3_* connection vars) actually exercises it.
 */
import { ConfigService } from '@nestjs/config';
import { S3StorageProvider } from '../s3-storage.provider';

const shouldRun = process.env.RUN_S3_CONFORMANCE_TESTS === 'true';
const describeIfEnabled = shouldRun ? describe : describe.skip;

describeIfEnabled('S3StorageProvider conformance (against MinIO)', () => {
  let provider: S3StorageProvider;

  beforeAll(() => {
    const config = new ConfigService({
      S3_BUCKET: process.env.S3_BUCKET,
      S3_REGION: process.env.S3_REGION,
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
      S3_ENDPOINT: process.env.S3_ENDPOINT,
      S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    });
    provider = new S3StorageProvider(config);
  });

  it('round-trips upload -> download with identical bytes', async () => {
    const buffer = Buffer.from('hdsp-phase3-conformance-test');
    const objectId = await provider.upload(buffer, `conformance/${Date.now()}.txt`, 'text/plain');
    const downloaded = await provider.download(objectId);
    expect(downloaded.equals(buffer)).toBe(true);
    await provider.delete(objectId);
  });

  it('prefixes the object key with tenantId when provided', async () => {
    const buffer = Buffer.from('tenant-scoped-object');
    const objectId = await provider.upload(buffer, `conformance/${Date.now()}.txt`, 'text/plain', undefined, 'tenant-a');
    expect(objectId.startsWith('tenant-a/')).toBe(true);
    const downloaded = await provider.download(objectId);
    expect(downloaded.equals(buffer)).toBe(true);
    await provider.delete(objectId);
  });

  it('does not prefix the object key when tenantId is omitted', async () => {
    const buffer = Buffer.from('unscoped-object');
    const objectId = await provider.upload(buffer, `conformance/${Date.now()}.txt`, 'text/plain');
    expect(objectId.startsWith('conformance/')).toBe(true);
    await provider.delete(objectId);
  });

  it('getMetadata reflects size and content type after upload', async () => {
    const buffer = Buffer.from('metadata-check-content');
    const objectId = await provider.upload(buffer, `conformance/${Date.now()}.txt`, 'text/plain');
    const metadata = await provider.getMetadata(objectId);
    expect(metadata.sizeBytes).toBe(buffer.length);
    expect(metadata.mimeType).toBe('text/plain');
    await provider.delete(objectId);
  });

  it('delete is idempotent -- deleting twice does not throw', async () => {
    const buffer = Buffer.from('delete-twice');
    const objectId = await provider.upload(buffer, `conformance/${Date.now()}.txt`, 'text/plain');
    await provider.delete(objectId);
    await expect(provider.delete(objectId)).resolves.not.toThrow();
  });

  it('getPresignedDownloadUrl returns a fetchable URL', async () => {
    const buffer = Buffer.from('presigned-url-check');
    const objectId = await provider.upload(buffer, `conformance/${Date.now()}.txt`, 'text/plain');
    const url = await provider.getPresignedDownloadUrl(objectId, 60);
    expect(url).toMatch(/^https?:\/\//);
    await provider.delete(objectId);
  });
});

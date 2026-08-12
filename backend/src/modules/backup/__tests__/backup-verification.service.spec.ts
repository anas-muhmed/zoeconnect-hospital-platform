import * as crypto from 'crypto';
import { Readable } from 'stream';
import { BackupVerificationService, ChecksumMismatchError, InvalidManifestError } from '../services/backup-verification.service';
import type { BackupManifest } from '../services/backup-manifest.service';

function streamOf(text: string): Readable {
  return Readable.from([Buffer.from(text, 'utf-8')]);
}

function baseManifest(overrides: Partial<BackupManifest> = {}): BackupManifest {
  return {
    schemaVersion: 1,
    backupId: 'b1',
    createdAt: new Date().toISOString(),
    createdBy: null,
    deploymentType: 'self_hosted',
    tenantId: null,
    backupType: 'manual',
    modules: ['database'],
    appVersion: '1.0.0',
    dbVersion: '16.2',
    fileCount: 0,
    databaseSizeBytes: null,
    encrypted: false,
    sizeBytes: 0,
    compressedSizeBytes: 0,
    compressionRatio: null,
    durationMs: null,
    status: 'completed',
    checksumSha256: null,
    ...overrides,
  };
}

describe('BackupVerificationService', () => {
  const service = new BackupVerificationService();

  it('computeSha256() matches a manually-computed SHA-256 hash', async () => {
    const content = 'hello backup world';
    const expected = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    const actual = await service.computeSha256(streamOf(content));
    expect(actual).toBe(expected);
  });

  it('verifyChecksum() resolves when the checksum matches', async () => {
    const content = 'valid archive bytes';
    const expected = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    await expect(service.verifyChecksum(streamOf(content), expected)).resolves.toBe(expected);
  });

  it('verifyChecksum() REJECTS a corrupted/tampered archive with ChecksumMismatchError', async () => {
    const content = 'tampered archive bytes';
    const wrongExpected = crypto.createHash('sha256').update('original bytes', 'utf-8').digest('hex');
    await expect(service.verifyChecksum(streamOf(content), wrongExpected)).rejects.toThrow(ChecksumMismatchError);
  });

  it('validateManifestStructure() accepts a well-formed manifest', () => {
    expect(() => service.validateManifestStructure(baseManifest())).not.toThrow();
  });

  it('validateManifestStructure() rejects a manifest missing required fields', () => {
    const manifest = baseManifest({ backupId: '' as unknown as string });
    expect(() => service.validateManifestStructure(manifest)).toThrow(InvalidManifestError);
  });

  it('validateManifestStructure() rejects an unrecognized deploymentType', () => {
    const manifest = baseManifest({ deploymentType: 'weird' as unknown as BackupManifest['deploymentType'] });
    expect(() => service.validateManifestStructure(manifest)).toThrow(InvalidManifestError);
  });
});

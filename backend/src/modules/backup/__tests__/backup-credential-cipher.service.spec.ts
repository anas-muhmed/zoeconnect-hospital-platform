import { BackupCredentialCipherService } from '../services/backup-credential-cipher.service';

describe('BackupCredentialCipherService', () => {
  function createService(key = 'a-sufficiently-random-32-byte-testing-key') {
    const configService = { get: jest.fn().mockReturnValue(key) } as any;
    return new BackupCredentialCipherService(configService);
  }

  it('fails fast when no key is configured, for both encrypt() and decrypt()', () => {
    const service = createService('');
    expect(service.isConfigured()).toBe(false);
    expect(() => service.encrypt({ secretAccessKey: 'abc' })).toThrow(/BACKUP_CREDENTIALS_ENCRYPTION_KEY/);
    expect(() => service.decrypt('not-empty-blob')).toThrow(/BACKUP_CREDENTIALS_ENCRYPTION_KEY/);
  });

  it('never silently falls back to plaintext -- encrypt() throws rather than returning the plaintext unencrypted', () => {
    const service = createService('');
    let thrown = false;
    try {
      service.encrypt({ password: 'hunter2' });
    } catch (err) {
      thrown = true;
      expect((err as Error).message).not.toContain('hunter2');
    }
    expect(thrown).toBe(true);
  });

  it('round-trips an encrypt/decrypt cycle exactly', () => {
    const service = createService();
    const creds = { accessKeyId: 'AKIA123', secretAccessKey: 'super-secret-value', nested: { x: 1 } };
    const blob = service.encrypt(creds);
    expect(blob).not.toBeNull();
    expect(blob).not.toContain('super-secret-value');
    const decrypted = service.decrypt(blob);
    expect(decrypted).toEqual(creds);
  });

  it('returns null for empty/undefined credentials rather than encrypting an empty object', () => {
    const service = createService();
    expect(service.encrypt({})).toBeNull();
    expect(service.encrypt(undefined)).toBeNull();
    expect(service.encrypt(null)).toBeNull();
  });

  it('decrypt() of a null/empty blob returns {}', () => {
    const service = createService();
    expect(service.decrypt(null)).toEqual({});
    expect(service.decrypt(undefined)).toEqual({});
  });

  it('throws a clear error on tampered/corrupted ciphertext rather than silently returning garbage', () => {
    const service = createService();
    const blob = service.encrypt({ secret: 'value' })!;
    const tampered = Buffer.from(blob, 'base64');
    tampered[tampered.length - 1] ^= 0xff; // flip a byte inside the ciphertext
    expect(() => service.decrypt(tampered.toString('base64'))).toThrow();
  });

  it('splitConfig() routes only known credential fields for the driver into `credentials`, leaving the rest in `nonSecretConfig`', () => {
    const service = createService();
    const { nonSecretConfig, credentials } = service.splitConfig('s3', {
      bucket: 'my-bucket', region: 'us-east-1', accessKeyId: 'AKIA', secretAccessKey: 'shh',
    });
    expect(nonSecretConfig).toEqual({ bucket: 'my-bucket', region: 'us-east-1' });
    expect(credentials).toEqual({ accessKeyId: 'AKIA', secretAccessKey: 'shh' });
  });

  it('splitConfig() for an unknown driver puts everything in nonSecretConfig rather than throwing', () => {
    const service = createService();
    const { nonSecretConfig, credentials } = service.splitConfig('carrier-pigeon', { anything: 'goes' });
    expect(nonSecretConfig).toEqual({ anything: 'goes' });
    expect(credentials).toEqual({});
  });

  it('mergeCredentials() re-assembles a flat config object for provider consumption', () => {
    const service = createService();
    const merged = service.mergeCredentials({ bucket: 'b' }, { secretAccessKey: 's' });
    expect(merged).toEqual({ bucket: 'b', secretAccessKey: 's' });
  });
});

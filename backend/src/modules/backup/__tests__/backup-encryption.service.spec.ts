import { Readable } from 'stream';
import { BackupEncryptionService } from '../services/backup-encryption.service';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('BackupEncryptionService', () => {
  function createService(defaultPassphrase = '') {
    const configService = { get: jest.fn().mockReturnValue(defaultPassphrase) } as any;
    return new BackupEncryptionService(configService);
  }

  it('encrypts and decrypts a stream, round-tripping the exact original plaintext', async () => {
    const service = createService();
    const plaintext = Buffer.from('The quick brown fox jumps over the lazy dog. '.repeat(1000), 'utf-8');
    const source = Readable.from([plaintext]);

    const encrypted = await service.encryptStream(source, 'correct-horse-battery-staple');
    const encryptedBytes = await streamToBuffer(encrypted);

    // Key is never persisted: only salt(16)+iv(16) header + ciphertext + authTag(16) trailer.
    expect(encryptedBytes.length).toBeGreaterThan(plaintext.length); // header + tag overhead
    expect(encryptedBytes.includes(Buffer.from('correct-horse-battery-staple'))).toBe(false);

    const decrypted = service.decryptStream(Readable.from([encryptedBytes]), 'correct-horse-battery-staple');
    const decryptedBytes = await streamToBuffer(decrypted);

    expect(decryptedBytes.equals(plaintext)).toBe(true);
  });

  it('rejects decryption with the wrong passphrase (corrupted/tampered detection via GCM auth tag)', async () => {
    const service = createService();
    const plaintext = Buffer.from('sensitive backup contents', 'utf-8');
    const encrypted = await service.encryptStream(Readable.from([plaintext]), 'right-passphrase');
    const encryptedBytes = await streamToBuffer(encrypted);

    const decrypted = service.decryptStream(Readable.from([encryptedBytes]), 'wrong-passphrase');
    await expect(streamToBuffer(decrypted)).rejects.toThrow();
  });

  it('resolvePassphrase() prefers the explicit passphrase over the configured default', () => {
    const service = createService('default-pass');
    expect(service.resolvePassphrase('explicit-pass')).toBe('explicit-pass');
    expect(service.resolvePassphrase()).toBe('default-pass');
  });

  it('resolvePassphrase() throws when neither explicit nor default passphrase is available', () => {
    const service = createService('');
    expect(() => service.resolvePassphrase()).toThrow(/no passphrase/);
  });
});

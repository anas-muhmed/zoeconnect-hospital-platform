import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM's recommended nonce size
const AUTH_TAG_LENGTH = 16;

/**
 * BackupCredentialCipherService — AES-256-GCM at-rest encryption for the
 * credential-bearing sub-fields of BackupStorageConfig.config (S3 secret
 * access key, SFTP password/private key, Azure connection string, etc.).
 *
 * Design (item 10 of the backup storage hardening brief):
 *   - The admin still submits credentials in plaintext, once, over an
 *     authenticated + audited request (CreateStorageProviderDto's shape is
 *     unchanged) -- this service sits inside the entity's service layer
 *     (BackupStorageConfigService / BackupController), not the DTO.
 *   - `config` (jsonb) keeps only NON-secret fields (bucket, region, host,
 *     path, port, keyPrefix, ...) in plaintext -- those aren't sensitive and
 *     staying human-readable/queryable is useful.
 *   - Whatever credential sub-fields exist for a given driver (see
 *     CREDENTIAL_FIELDS_BY_DRIVER) are pulled out, JSON-serialized, and
 *     AES-256-GCM encrypted into the `encryptedCredentials` text column.
 *     `decryptCredentials()` reverses this and the caller merges the result
 *     back into `config` in memory before handing it to
 *     BackupStorageProviderFactory -- provider classes never see the
 *     encrypted-at-rest representation, only the fully-assembled config.
 *
 * Key handling: BACKUP_CREDENTIALS_ENCRYPTION_KEY, decoded as base64, hex,
 * or (if neither decodes to exactly 32 bytes) treated as raw utf8 and
 * padded/hashed via SHA-256 into a 32-byte key -- this keeps operator setup
 * forgiving (any reasonably random 32+ char string works) while still
 * guaranteeing a proper 32-byte AES-256 key. Reuses the AES-256-GCM
 * primitive/wire-format style already established by BackupEncryptionService
 * (salt/iv header, trailing auth tag) for consistency, but is intentionally
 * a separate, simpler class: BackupEncryptionService streams arbitrarily
 * large archive bytes with a per-encryption scrypt-derived key from a
 * user-supplied passphrase; this service encrypts small in-memory JSON blobs
 * with one operator-configured static key, loaded once at startup.
 *
 * FAIL-FAST CONTRACT: if `encrypt()`/`decrypt()` is called with no key
 * configured, this throws immediately with a clear error. It never silently
 * falls back to storing credentials in plaintext -- callers (the storage
 * destination service) must not catch-and-ignore that error.
 */
@Injectable()
export class BackupCredentialCipherService {
  private readonly logger = new Logger(BackupCredentialCipherService.name);
  private cachedKey: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {}

  /** True once a usable 32-byte key is configured; lets callers decide whether to attempt encryption at all. */
  isConfigured(): boolean {
    try {
      this.resolveKey();
      return true;
    } catch {
      return false;
    }
  }

  private resolveKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    const raw = this.configService.get<string>('backup.credentialsEncryptionKey') || '';
    if (!raw) {
      throw new Error(
        'BACKUP_CREDENTIALS_ENCRYPTION_KEY is not configured. A backup storage destination with ' +
        'credential fields cannot be saved encrypted-at-rest without it -- set a 32-byte key ' +
        '(base64, hex, or any sufficiently random string) before configuring destinations with real ' +
        'credentials (S3, SFTP, Azure, ...). This is deliberate fail-fast behaviour: this service ' +
        'never falls back to storing credentials in plaintext.',
      );
    }
    let key: Buffer | null = null;
    for (const decode of ['base64', 'hex'] as const) {
      try {
        const candidate = Buffer.from(raw, decode);
        if (candidate.length === 32) { key = candidate; break; }
      } catch {
        // try next encoding
      }
    }
    if (!key) {
      // Not a 32-byte base64/hex string -- derive a 32-byte key deterministically
      // via SHA-256 so any sufficiently random operator-chosen string still works.
      key = crypto.createHash('sha256').update(raw, 'utf8').digest();
    }
    this.cachedKey = key;
    return key;
  }

  /**
   * Encrypts an arbitrary JSON-serializable credentials object into an
   * opaque base64 blob for storage in `encryptedCredentials`. Returns null
   * unchanged if `plain` is empty/undefined (nothing to encrypt) rather
   * than encrypting an empty object -- callers use this to decide whether
   * `encryptedCredentials` should be null.
   */
  encrypt(plain: Record<string, unknown> | null | undefined): string | null {
    if (!plain || Object.keys(plain).length === 0) return null;
    const key = this.resolveKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(JSON.stringify(plain), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // [iv][authTag][ciphertext], base64-encoded -- small enough to not need streaming.
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  /** Inverse of encrypt(). Returns {} for a null/empty blob. Throws on tamper/wrong-key/no-key-configured. */
  decrypt(blob: string | null | undefined): Record<string, unknown> {
    if (!blob) return {};
    const key = this.resolveKey();
    const buf = Buffer.from(blob, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    try {
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8'));
    } catch (err) {
      this.logger.error(`Failed to decrypt backup storage destination credentials: ${(err as Error).message}`);
      throw new Error('Failed to decrypt backup storage destination credentials -- wrong BACKUP_CREDENTIALS_ENCRYPTION_KEY or corrupted data.');
    }
  }

  /** Driver-specific field names treated as secrets and routed into encryptedCredentials instead of plaintext config. */
  static readonly CREDENTIAL_FIELDS_BY_DRIVER: Record<string, string[]> = {
    local: [],
    network_share: ['username', 'password'],
    s3: ['accessKeyId', 'secretAccessKey'],
    azure: ['connectionString', 'accountKey', 'sasToken'],
    gcs: ['keyFilePath', 'clientEmail', 'privateKey'],
    sftp: ['password', 'privateKey', 'passphrase'],
  };

  /**
   * Splits a driver's raw submitted config into { nonSecretConfig,
   * credentials } per CREDENTIAL_FIELDS_BY_DRIVER. Unknown drivers get an
   * empty credential set (everything stays in plaintext config) rather than
   * throwing, so a future pluggable driver doesn't hard-fail here --
   * whoever wires it in should extend CREDENTIAL_FIELDS_BY_DRIVER.
   */
  splitConfig(driver: string, config: Record<string, unknown>): {
    nonSecretConfig: Record<string, unknown>;
    credentials: Record<string, unknown>;
  } {
    const secretFields = new Set(BackupCredentialCipherService.CREDENTIAL_FIELDS_BY_DRIVER[driver] ?? []);
    const nonSecretConfig: Record<string, unknown> = {};
    const credentials: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config ?? {})) {
      if (secretFields.has(k) && v !== undefined && v !== null && v !== '') credentials[k] = v;
      else nonSecretConfig[k] = v;
    }
    return { nonSecretConfig, credentials };
  }

  /** Re-merges decrypted credentials back into a plaintext config object for handing to a storage provider. */
  mergeCredentials(nonSecretConfig: Record<string, unknown>, credentials: Record<string, unknown>): Record<string, unknown> {
    return { ...nonSecretConfig, ...credentials };
  }
}

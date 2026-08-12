import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Readable, Transform, TransformCallback, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt) as (
  password: string, salt: Buffer, keylen: number,
) => Promise<Buffer>;

const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const HEADER_LENGTH = SALT_LENGTH + IV_LENGTH;
const ALGORITHM = 'aes-256-gcm';

/**
 * BackupEncryptionService — optional AES-256-GCM streaming encryption for
 * backup archives, password-protected, with the derived key NEVER written
 * into the archive itself (spec requirement).
 *
 * Wire format written by `encryptStream()`:
 *   [salt (16 bytes)] [iv (16 bytes)] [ciphertext ...] [authTag (16 bytes)]
 *
 * Only `salt` and `iv` are persisted -- both are public parameters, useless
 * without the passphrase. The AES key itself is derived on the fly via
 * `scrypt(passphrase, salt, 32)` on both encrypt and decrypt, and is never
 * serialized anywhere. The GCM auth tag is appended as a trailer (rather
 * than a header) because it is only known once every plaintext byte has
 * been encrypted -- required for true single-pass streaming with no
 * whole-archive buffering.
 *
 * `decryptStream()` is written as a small streaming state machine: it reads
 * the 32-byte header before constructing the decipher, then always holds
 * back the last 16 bytes of the stream (the eventual auth tag) until
 * `_flush()`, at which point `setAuthTag()` + `final()` verifies integrity.
 * A wrong passphrase or a corrupted/tampered archive throws here --
 * BackupVerificationService's SHA-256 manifest check is the first integrity
 * gate; this is the second, cryptographic one.
 */
@Injectable()
export class BackupEncryptionService {
  private readonly logger = new Logger(BackupEncryptionService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Effective passphrase: explicit argument wins, else the configured default, else throws. */
  resolvePassphrase(explicit?: string | null): string {
    const passphrase = explicit || this.configService.get<string>('backup.encryptionPassphrase') || '';
    if (!passphrase) {
      throw new Error('Backup encryption was requested but no passphrase was supplied and no default is configured (BACKUP_ENCRYPTION_PASSPHRASE).');
    }
    return passphrase;
  }

  /**
   * Wraps `source` so that reading the returned stream yields the encrypted
   * wire-format bytes described above. Streaming end-to-end -- never
   * buffers the whole plaintext or ciphertext.
   */
  async encryptStream(source: Readable, passphrase: string): Promise<Readable> {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = await scryptAsync(passphrase, salt, 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const output = new PassThrough();
    // Header is written synchronously before the pipeline below starts
    // pumping ciphertext into `output` -- Node preserves write() ordering
    // on a single Writable regardless of when downstream reads happen.
    output.write(Buffer.concat([salt, iv]));

    const cipherTransform = new Transform({
      transform(chunk: Buffer, _enc, callback: TransformCallback) {
        callback(null, cipher.update(chunk));
      },
      flush(callback: TransformCallback) {
        const final = cipher.final();
        const tag = cipher.getAuthTag();
        callback(null, Buffer.concat([final, tag]));
      },
    });

    pipeline(source, cipherTransform, output).catch((err) => {
      this.logger.error(`Backup encryption stream failed: ${(err as Error).message}`);
      output.destroy(err as Error);
    });

    return output;
  }

  /**
   * Inverse of `encryptStream()`. Returns a Readable of the original
   * plaintext bytes; throws (via the returned stream's 'error' event, or by
   * rejecting if awaited via a consuming pipeline) if the passphrase is
   * wrong or the archive was corrupted/tampered with (GCM tag mismatch).
   */
  decryptStream(source: Readable, passphrase: string): Readable {
    let decipher: crypto.DecipherGCM | null = null;
    let headerBuf = Buffer.alloc(0);
    let tailBuf = Buffer.alloc(0);

    const transform = new Transform({
      async transform(chunk: Buffer, _enc, callback: TransformCallback) {
        try {
          let data = chunk;
          if (!decipher) {
            headerBuf = Buffer.concat([headerBuf, data]);
            if (headerBuf.length < HEADER_LENGTH) { callback(); return; }
            const salt = headerBuf.subarray(0, SALT_LENGTH);
            const iv = headerBuf.subarray(SALT_LENGTH, HEADER_LENGTH);
            data = headerBuf.subarray(HEADER_LENGTH);
            const key = await scryptAsync(passphrase, salt, 32);
            decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
          }
          const combined = Buffer.concat([tailBuf, data]);
          if (combined.length > AUTH_TAG_LENGTH) {
            const emit = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);
            tailBuf = combined.subarray(combined.length - AUTH_TAG_LENGTH);
            callback(null, decipher.update(emit));
          } else {
            tailBuf = combined;
            callback();
          }
        } catch (err) {
          callback(err as Error);
        }
      },
      flush(callback: TransformCallback) {
        try {
          if (!decipher || tailBuf.length !== AUTH_TAG_LENGTH) {
            callback(new Error('Encrypted backup archive is truncated (missing header or auth tag)'));
            return;
          }
          decipher.setAuthTag(tailBuf);
          const final = decipher.final();
          callback(null, final);
        } catch {
          callback(new Error('Backup archive decryption failed — wrong passphrase or corrupted/tampered archive'));
        }
      },
    });

    return source.pipe(transform);
  }
}

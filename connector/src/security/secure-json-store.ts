import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { dpapiProtect, dpapiUnprotect, isDpapiAvailable } from './dpapi';

/**
 * Generic encrypted-at-rest JSON file store (Task #103, 2026-07-22).
 *
 * Two backends, chosen automatically by platform:
 *  - **win32**: real Windows DPAPI (`dpapi.ts`) -- the OS itself owns the
 *    encryption key, tied to the service account's profile. Nothing this
 *    process manages or could leak.
 *  - **everything else** (this sandbox, Linux/macOS dev machines): the
 *    same AES-256-GCM-with-a-local-key-file approach `TokenStore`
 *    (`auth/token-store.ts`) already uses and documents -- explicitly a
 *    dev-only fallback, not claimed as equivalent security to DPAPI (see
 *    that file's own honest-limitation doc comment, which applies
 *    identically here).
 *
 * `TokenStore` itself was deliberately NOT refactored to use this class in
 * this pass -- it already works, and this task's explicit scope is Oracle
 * credential storage; touching a working, already-tested class to share
 * plumbing with a new one is exactly the kind of unrelated refactor this
 * project's engineering rules ask to keep separate from feature work.
 * Migrating `TokenStore` onto DPAPI-on-Windows-too is a natural, low-risk
 * follow-up, not done here.
 */
export class SecureJsonStore<T> {
  constructor(
    private readonly dir: string,
    private readonly filename: string,
  ) {}

  private get filePath(): string {
    return path.join(this.dir, this.filename);
  }

  private get keyPath(): string {
    // Only used by the non-Windows fallback backend.
    return path.join(this.dir, `${this.filename}.key`);
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }

  save(value: T): void {
    this.ensureDir();
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');

    if (isDpapiAvailable()) {
      const ciphertextB64 = dpapiProtect(plaintext);
      fs.writeFileSync(this.filePath, JSON.stringify({ backend: 'dpapi', ciphertext: ciphertextB64 }), { mode: 0o600 });
      return;
    }

    const key = this.getOrCreateFallbackKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    fs.writeFileSync(this.filePath, JSON.stringify({
      backend: 'aes-256-gcm-local-key',
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }), { mode: 0o600 });
  }

  load(): T | null {
    if (!fs.existsSync(this.filePath)) return null;
    const payload = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));

    if (payload.backend === 'dpapi') {
      if (!isDpapiAvailable()) {
        throw new Error(`${this.filename} was encrypted with DPAPI on Windows but is being read on ${process.platform} -- this store is not portable across machines/platforms by design.`);
      }
      return JSON.parse(dpapiUnprotect(payload.ciphertext).toString('utf8')) as T;
    }

    if (payload.backend === 'aes-256-gcm-local-key') {
      const key = this.getOrCreateFallbackKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8')) as T;
    }

    throw new Error(`Unknown secure-store backend "${payload.backend}" in ${this.filePath}`);
  }

  clear(): void {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
  }

  private getOrCreateFallbackKey(): Buffer {
    this.ensureDir();
    if (fs.existsSync(this.keyPath)) {
      return fs.readFileSync(this.keyPath);
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(this.keyPath, key, { mode: 0o600 });
    return key;
  }
}

/**
 * IAntiVirusProvider — extension point for antivirus scanning of uploaded files.
 *
 * The default implementation is NoOpAntiVirusProvider which always passes.
 * Replace with a real implementation (ClamAV, cloud AV API, etc.) by providing
 * a different class bound to ANTI_VIRUS_PROVIDER in the module.
 *
 * Contract:
 *   - resolve()  → file is clean, upload may proceed
 *   - reject()   → file is infected; caller must NOT write to storage
 *
 * The scanner should operate on the raw buffer before any storage I/O so
 * that infected files never touch disk or the object store.
 */
export interface IAntiVirusProvider {
  scan(buffer: Buffer, filename: string, mimeType: string): Promise<void>;
}

/**
 * No-op implementation — always passes.
 * This is the default for Milestone 1; swap this binding to enable real AV.
 */
export class NoOpAntiVirusProvider implements IAntiVirusProvider {
  async scan(_buffer: Buffer, _filename: string, _mimeType: string): Promise<void> {
    // No-op: replace with real AV scan in production
  }
}

export const ANTI_VIRUS_PROVIDER = Symbol('ANTI_VIRUS_PROVIDER');

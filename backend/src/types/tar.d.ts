/**
 * Minimal ambient type declaration for the `tar` package (v6, node-tar).
 *
 * No `@types/tar` package is installed in this repo, and node-tar itself
 * ships no `.d.ts`. Rather than pull in a new devDependency for a handful
 * of calls, this declares only the surface BackupArchiveService actually
 * uses: `tar.create()` (producing a tar stream from a file list) and
 * `tar.extract()` (a writable stream that un-tars into a target directory).
 * Both are used with `gzip: false` -- BackupCompressionService owns the
 * gzip layer explicitly so it can sit between tar and encryption in the
 * pipe chain (tar -> gzip -> encrypt -> storage), rather than delegating
 * compression to `tar`'s own built-in (and un-interceptable) gzip option.
 */
declare module 'tar' {
  import { Readable, Writable } from 'stream';

  export interface CreateOptions {
    cwd?: string;
    gzip?: boolean;
    portable?: boolean;
    filter?: (path: string, stat: unknown) => boolean;
    noDirRecurse?: boolean;
    follow?: boolean;
  }

  export interface ExtractOptions {
    cwd: string;
    gzip?: boolean;
    strip?: number;
    preservePaths?: boolean;
    filter?: (path: string, entry?: unknown) => boolean;
  }

  /** Returns a readable tar-stream over the given file list (relative to `options.cwd`). */
  export function create(options: CreateOptions, fileList: string[]): Readable;

  /** Returns a writable stream that un-tars whatever is piped into it under `options.cwd`. */
  export function extract(options: ExtractOptions): Writable;
}

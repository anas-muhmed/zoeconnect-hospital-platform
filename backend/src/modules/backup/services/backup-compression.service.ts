import { Injectable } from '@nestjs/common';
import * as zlib from 'zlib';
import { Readable } from 'stream';

/**
 * BackupCompressionService — thin, single-purpose streaming gzip wrapper.
 *
 * Deliberately generic over any byte stream (not tar-aware) so it can sit
 * anywhere in a pipe chain: BackupArchiveService pipes a raw tar stream
 * through `compressStream()` to produce tar.gz bytes, then (optionally)
 * through BackupEncryptionService. Never buffers the whole stream in
 * memory — `zlib.createGzip()`/`createGunzip()` are themselves streaming,
 * and `.pipe()` here adds no buffering of its own.
 */
@Injectable()
export class BackupCompressionService {
  compressStream(source: Readable, level: number = zlib.constants.Z_DEFAULT_COMPRESSION): Readable {
    const gzip = zlib.createGzip({ level });
    source.pipe(gzip);
    // Forward upstream errors so they don't get silently swallowed by
    // .pipe()'s default (non-error-propagating) behavior -- callers that
    // chain several of these together (BackupArchiveService) need a
    // failure anywhere upstream to surface on the final stream they await.
    source.on('error', (err) => gzip.destroy(err));
    return gzip;
  }

  decompressStream(source: Readable): Readable {
    const gunzip = zlib.createGunzip();
    source.pipe(gunzip);
    source.on('error', (err) => gunzip.destroy(err));
    return gunzip;
  }
}

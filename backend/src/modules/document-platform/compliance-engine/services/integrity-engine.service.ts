import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class IntegrityEngineService {
  private readonly logger = new Logger(IntegrityEngineService.name);

  /**
   * Generates a SHA-256 hash for a given JSON payload.
   * Sorts keys to ensure deterministic hashing.
   */
  hashPayload(payload: Record<string, unknown> | string): string {
    const stringified = typeof payload === 'string' 
      ? payload 
      : this.deterministicStringify(payload);

    return crypto.createHash('sha256').update(stringified).digest('hex');
  }

  /**
   * Links a new event hash to the previous chain hash to form the blockchain ledger.
   */
  chainHash(payloadHash: string, previousHash: string | null, timestamp: Date): string {
    const dataToHash = `${previousHash || 'GENESIS'}:${payloadHash}:${timestamp.toISOString()}`;
    return crypto.createHash('sha256').update(dataToHash).digest('hex');
  }

  private deterministicStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    
    if (Array.isArray(obj)) {
      const arrStr = obj.map(item => this.deterministicStringify(item)).join(',');
      return `[${arrStr}]`;
    }

    const keys = Object.keys(obj).sort();
    const objStr = keys.map(key => `"${key}":${this.deterministicStringify(obj[key])}`).join(',');
    return `{${objStr}}`;
  }
}

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';

export interface LicensePayload {
  licenseKey:         string;
  hospitalName:       string;
  hospitalCode:       string;
  issuedAt:           string;
  expiresAt:          string | null;
  modules:            string[];
  maxUsers:           number;
  machineFingerprint: string | null;
}

export interface SignedLicense extends LicensePayload {
  signature: string;
}

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);
  private readonly privateKeyPem: string;

  constructor() {
    this.privateKeyPem = this.loadPrivateKey();
  }

  sign(payload: LicensePayload): SignedLicense {
    if (!this.privateKeyPem) {
      throw new InternalServerErrorException(
        'License private key not found. Place keys/license-private.pem in the vendor portal root.',
      );
    }

    const ORDERED_KEYS: (keyof LicensePayload)[] = [
      'licenseKey', 'hospitalName', 'hospitalCode',
      'issuedAt', 'expiresAt', 'modules', 'maxUsers', 'machineFingerprint',
    ];

    // Build canonical JSON in fixed key order (must match ZoeConnect verifySignature)
    const canonical: Record<string, unknown> = {};
    for (const k of ORDERED_KEYS) canonical[k] = payload[k];

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(JSON.stringify(canonical));
    const signature = signer.sign(this.privateKeyPem, 'base64');

    return { ...payload, signature };
  }

  /** Compute HMAC-SHA256 of a webhook payload for authentication */
  computeHmac(secret: string, body: string): string {
    return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  private loadPrivateKey(): string {
    const paths = [
      path.join(process.cwd(), 'keys', 'license-private.pem'),
      path.join(__dirname, '..', '..', '..', '..', 'keys', 'license-private.pem'),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        this.logger.log(`Loaded license private key from ${p}`);
        return fs.readFileSync(p, 'utf8');
      }
    }
    this.logger.error('License private key NOT FOUND — RSA signing will fail');
    return '';
  }
}

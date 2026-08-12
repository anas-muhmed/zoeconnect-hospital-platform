import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { VendorSyncService } from '../../licensing/vendor-sync.service';
import * as crypto from 'crypto';

@Injectable()
export class VendorHmacGuard implements CanActivate {
  private readonly logger = new Logger(VendorHmacGuard.name);

  // Keep track of recent nonces to prevent replay attacks (in-memory, typically Redis is better for multi-instance)
  private readonly seenNonces = new Set<string>();

  constructor(private readonly vendorSyncService: VendorSyncService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const instanceId = request.headers['x-instance-id'] as string;
    const timestampHeader = request.headers['x-timestamp'] as string;
    const nonce = request.headers['x-nonce'] as string;
    const signatureHeader = request.headers['x-signature'] as string;
    const correlationId = request.headers['x-correlation-id'] as string;

    if (!instanceId || !timestampHeader || !nonce || !signatureHeader || !correlationId) {
      throw new UnauthorizedException('Missing required vendor authentication headers');
    }

    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      throw new UnauthorizedException('Invalid X-Timestamp header');
    }

    // 1. Prevent Replay Attacks (5 minute window)
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    if (Math.abs(now - timestamp) > windowMs) {
      throw new UnauthorizedException('Request timestamp is outside the acceptable window');
    }

    if (this.seenNonces.has(nonce)) {
      throw new UnauthorizedException('Replay attack detected: nonce already used');
    }
    this.seenNonces.add(nonce);
    
    // Clean up old nonces (simple garbage collection for the set)
    setTimeout(() => this.seenNonces.delete(nonce), windowMs * 2);

    // 2. Validate Instance Token / Secret
    const reg = await this.vendorSyncService.getRegistration();
    if (!reg || reg.instanceToken !== instanceId || reg.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or unregistered X-Instance-ID');
    }

    // 3. Verify HMAC Signature
    // Format: Signature = HMAC-SHA256(method + path + timestamp + nonce + body, instanceSecret)
    const method = request.method.toUpperCase();
    const path = request.url;
    const rawBody = (request as any).rawBody ? ((request as any).rawBody as Buffer).toString('utf8') : '';

    const payloadToSign = `${method}${path}${timestampHeader}${nonce}${rawBody}`;
    
    const expectedSignature = crypto
      .createHmac('sha256', reg.instanceSecret)
      .update(payloadToSign)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signatureHeader))) {
      this.logger.warn(`Invalid vendor HMAC signature for ${path}`);
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    // Pass along vendor context in the request for downstream processing
    (request as any).vendorContext = {
      correlationId,
      instanceId,
    };

    return true;
  }
}

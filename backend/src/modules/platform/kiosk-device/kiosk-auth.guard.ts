import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { KioskDevice } from './entities/kiosk-device.entity';

/**
 * Guards kiosk-device-facing routes (currently just `POST
 * /kiosk/heartbeat`) with a kiosk access token, verified manually against
 * `jwt.kioskSecret` -- NOT via the global JwtAuthGuard/passport
 * JwtStrategy, which only ever validates user tokens signed with
 * `jwt.secret`. This is the same manual-verify approach
 * ConnectorGateway.handleConnection() uses for connector access tokens
 * (see ../connector/connector.gateway.ts), adapted to a plain HTTP guard
 * since kiosks call over REST, not a WebSocket.
 *
 * On success, attaches the resolved `KioskDevice` to
 * `request.kioskDevice` so the controller doesn't need to look it up
 * again.
 */
@Injectable()
export class KioskAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(KioskDevice) private readonly deviceRepo: Repository<KioskDevice>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing kiosk access token');
    }
    const token = authHeader.slice('Bearer '.length);

    let payload: { sub: string; tenantId: string; type: string };
    try {
      payload = this.jwtService.verify(token, { secret: this.config.get<string>('jwt.kioskSecret') });
    } catch {
      throw new UnauthorizedException('Invalid or expired kiosk access token');
    }
    if (payload.type !== 'kiosk_access') {
      throw new UnauthorizedException('Invalid kiosk access token');
    }

    const device = await this.deviceRepo.findOne({ where: { id: payload.sub } });
    if (!device) throw new UnauthorizedException('Kiosk device not found');
    if (device.status === 'disabled' || device.status === 'revoked') {
      throw new ForbiddenException(`Kiosk device is ${device.status}`);
    }

    request.kioskDevice = device;
    return true;
  }
}

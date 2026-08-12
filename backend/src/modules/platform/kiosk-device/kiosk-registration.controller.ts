import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { KioskRegistrationService } from './kiosk-registration.service';
import { KioskAuthGuard } from './kiosk-auth.guard';
import { RegisterKioskDto } from './dto/register-kiosk.dto';
import { RefreshKioskTokenDto } from './dto/refresh-kiosk-token.dto';
import { HeartbeatKioskDto } from './dto/heartbeat-kiosk.dto';
import { KioskDevice } from './entities/kiosk-device.entity';

/**
 * Device-facing endpoints for Kiosk Desktop (Electron) tills --
 * mirrors ConnectorRegistrationController's shape
 * (../connector/connector-registration.controller.ts): `register` and
 * `token/refresh` are `@Public()` + throttled (the activation code /
 * refresh token themselves ARE the credential, same as the Connector),
 * `heartbeat` is guarded by KioskAuthGuard instead.
 */
@ApiTags('Kiosk Device')
@Controller('kiosk')
export class KioskRegistrationController {
  constructor(private readonly registrationService: KioskRegistrationService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 attempts/hour per IP
  @ApiOperation({ summary: 'Activate a Kiosk Desktop till using a one-time activation code' })
  async register(@Body() dto: RegisterKioskDto) {
    return this.registrationService.register(dto.activationCode, dto.hostname, dto.appVersion);
  }

  @Public()
  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 3600000 } })
  @ApiOperation({ summary: 'Exchange a kiosk refresh token for a new access+refresh pair' })
  async refresh(@Body() dto: RefreshKioskTokenDto) {
    return this.registrationService.refresh(dto.refreshToken);
  }

  @UseGuards(KioskAuthGuard)
  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 240, ttl: 3600000 } }) // ~30s cadence = 120/hr; generous headroom
  @ApiOperation({ summary: 'Kiosk liveness check-in (~every 30s)' })
  async heartbeat(@Request() req: { kioskDevice: KioskDevice }, @Body() dto: HeartbeatKioskDto) {
    const device = await this.registrationService.heartbeat(req.kioskDevice.id, {
      hostname: dto.hostname,
      appVersion: dto.appVersion,
    });
    return { status: device.status, lastHeartbeatAt: device.lastHeartbeatAt };
  }
}

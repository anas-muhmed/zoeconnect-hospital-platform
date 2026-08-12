import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { ConnectorRegistrationService } from './connector-registration.service';
import { RegisterConnectorDto } from './dto/register-connector.dto';
import { RefreshConnectorTokenDto } from './dto/refresh-connector-token.dto';

/**
 * ConnectorRegistrationController (ZoeConnect Connector, Phase A — 2026-07-21).
 *
 * Both routes are `@Public()` — a Connector process has no user JWT at
 * registration time (it's presenting a one-time pairing key instead) and
 * no connector JWT yet either at refresh time in the failure case (an
 * expired access token). Throttled the same way `SetupController`'s
 * public vendor-registration endpoint already is, for the same reason:
 * these are unauthenticated-by-design endpoints that accept a secret
 * credential, so brute-force/guessing resistance has to come from rate
 * limiting rather than a prior auth check.
 */
@ApiTags('Connector')
@Controller('connector')
export class ConnectorRegistrationController {
  constructor(private readonly registrationService: ConnectorRegistrationService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 attempts/hour per IP -- one-time pairing key, should never legitimately be retried this often
  @ApiOperation({ summary: 'Register a Connector instance using a one-time tenant pairing key' })
  async register(@Body() dto: RegisterConnectorDto) {
    return this.registrationService.register(dto.tenantCode, dto.activationCode, dto.hostname);
  }

  @Public()
  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 3600000 } }) // generous -- legitimate reconnects should never approach this
  @ApiOperation({ summary: 'Exchange a connector refresh token for a new access+refresh pair' })
  async refresh(@Body() dto: RefreshConnectorTokenDto) {
    return this.registrationService.refresh(dto.refreshToken);
  }
}

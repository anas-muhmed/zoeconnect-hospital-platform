import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KioskDevice } from './entities/kiosk-device.entity';
import { KioskPairing } from './entities/kiosk-pairing.entity';
import { KioskRegistrationService } from './kiosk-registration.service';
import { KioskRegistrationController } from './kiosk-registration.controller';
import { KioskAdminService } from './kiosk-admin.service';
import { KioskAdminController } from './kiosk-admin.controller';
import { KioskAuthGuard } from './kiosk-auth.guard';
import { RedisProvider } from '../../../common/redis/redis.provider';
import { LicensingModule } from '../../licensing/license.module';

/**
 * Kiosk Desktop (Electron till) device management -- registration,
 * heartbeat, and admin (activation codes + device list/disable/revoke).
 * Structured identically to ConnectorModule (../connector/connector.module.ts):
 * its own JwtModule instance bound to the kiosk-specific secret, so a
 * mistaken DI wiring can never hand out a token signed with the wrong key.
 *
 * Imports LicensingModule because KioskAdminController is guarded by
 * LicenseGuard (same guard stack as TokenKioskController) -- LicenseGuard
 * depends on ILicenseProvider (LICENSE_PROVIDER), which only exists in
 * LicensingModule's provider graph. TokenModule imports it for the exact
 * same reason (see token.module.ts) -- this isn't a new pattern, just the
 * same one this module forgot to bring in initially.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([KioskDevice, KioskPairing]),
    LicensingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.kioskSecret'),
        signOptions: { expiresIn: config.get<string>('jwt.kioskExpiresIn', '15m') },
      }),
    }),
  ],
  controllers: [KioskRegistrationController, KioskAdminController],
  providers: [KioskRegistrationService, KioskAdminService, KioskAuthGuard, RedisProvider],
  exports: [KioskRegistrationService, KioskAdminService],
})
export class KioskDeviceModule {}

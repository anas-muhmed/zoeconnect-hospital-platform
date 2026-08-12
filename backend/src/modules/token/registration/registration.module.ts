import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { TokenRecord }        from '../entities/token-record.entity';
import { TokenLocation }      from '../entities/token-location.entity';
import { TokenReservation }   from './entities/token-reservation.entity';
import { TokenPatientMapping } from './entities/token-patient-mapping.entity';
import { MappingAuditLog }    from './entities/mapping-audit-log.entity';

import { RegistrationService }    from './registration.service';
import { RegistrationController } from './registration.controller';

// Stage B (Checkpoint B3.8) — tenant scoping infrastructure
import { TenantModule } from '../../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TokenRecord,
      TokenLocation,
      TokenReservation,
      TokenPatientMapping,
      MappingAuditLog,
    ]),
    TenantModule,
    // Needed only to mint/verify the short-lived reservation-capability
    // tokens used by the popup-window HIS integration (see
    // registration.service.ts's mintCapabilityToken). Registered with the
    // same jwt.secret as AuthModule's JwtModule so JwtStrategy can verify
    // these tokens through the exact same passport 'jwt' strategy/guard
    // already applied everywhere else -- no second auth pipeline needed.
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [
    RegistrationService,

    // Stage B (Checkpoint B3.8) — scoped repositories for getTokenState()/
    // getMappingByMrn() only. Alongside (not replacing) the raw
    // TypeOrmModule.forFeature repositories above.
    //
    // Promoted 'dry-run' -> 'enforced' (2026-07-16): part of the consolidated
    // audit/fix pass triggered by the confirmed Users cross-tenant leak — see
    // HYBRID_ARCHITECTURE_LOG.md / PHASE_10_DEFERRED_BACKLOG.md.
    createTenantScopedRepositoryProvider(TokenRecord, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(TokenPatientMapping, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(TokenReservation, { mode: 'enforced' }),
  ],
  controllers: [RegistrationController],
  exports:     [RegistrationService],
})
export class RegistrationModule {}

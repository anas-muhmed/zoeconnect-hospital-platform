import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { CloudPasswordResetController } from './cloud-password-reset.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';
import { Role } from '../rbac/entities/role.entity';
import { PasswordResetRequest } from './entities/password-reset-request.entity';
import { Tenant } from '../platform/tenant/entities/tenant.entity';
import { VendorRegistration } from '../licensing/entities/vendor-registration.entity';
import { CloudLicensingHmacGuard } from '../licensing/guards/cloud-licensing-hmac.guard';
import { AuditModule } from '../audit/audit.module';
import { BranchModule } from '../branch/branch.module';
import { LicensingModule } from '../licensing/license.module';
import { SettingsModule } from '../settings/settings.module';
import { HisModule } from '../his/his.module';
import { UsersModule } from '../users/users.module';
import { RedisProvider } from '../../common/redis/redis.provider';
import { SetupController } from './setup.controller';
import { TenantModule } from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

/**
 * Stage B (Checkpoint B3.3) — `PasswordResetService.listRequests()` (the
 * method backing `GET /auth/password-reset-requests`) uses a
 * `TenantScopedRepository` for `PasswordResetRequest`, alongside the raw
 * repository used for every write path and for the `@Cron`-driven
 * `expireStaleRequests()` (a second B6 candidate — background job, no
 * request-scoped tenant context available; see
 * `HYBRID_ARCHITECTURE_LOG.md`'s B3.3 entry).
 *
 * Promoted 'dry-run' -> 'enforced' (2026-07-16): part of the consolidated
 * audit/fix pass triggered by the confirmed Users cross-tenant leak — see
 * HYBRID_ARCHITECTURE_LOG.md / PHASE_10_DEFERRED_BACKLOG.md.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, PasswordResetRequest, Tenant, VendorRegistration]),
    ScheduleModule.forRoot(),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn', '15m') },
      }),
    }),
    AuditModule,
    BranchModule,
    LicensingModule,
    SettingsModule,
    HisModule,
    UsersModule,
    TenantModule,
  ],
  controllers: [AuthController, SetupController, CloudPasswordResetController],
  providers: [
    AuthService,
    PasswordResetService,
    JwtStrategy,
    RedisProvider,
    CloudLicensingHmacGuard,
    createTenantScopedRepositoryProvider(PasswordResetRequest, { mode: 'enforced' }),
  ],
  exports: [AuthService, PasswordResetService, JwtModule, PassportModule],
})
export class AuthModule {}

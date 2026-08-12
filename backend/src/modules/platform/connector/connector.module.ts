import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConnectorInstance } from './entities/connector-instance.entity';
import { TenantConnectorPairing } from '../tenant-provisioning/entities/tenant-connector-pairing.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { ConnectorRegistrationService } from './connector-registration.service';
import { ConnectorRegistrationController } from './connector-registration.controller';
import { ConnectorGateway } from './connector.gateway';
import { ConnectorJobDispatchService } from './connector-job-dispatch.service';
import { ConnectorJobDispatchProcessor } from './connector-job-dispatch.processor';
import { ConnectorDirectoryService } from './connector-directory.service';
import { QUEUE_NAMES } from '../../../config/redis.config';
import { RedisProvider } from '../../../common/redis/redis.provider';

/**
 * ConnectorModule (ZoeConnect Connector, Phase A — 2026-07-21).
 *
 * Registers its own `JwtModule` (same convention as `AuthModule`/
 * `TokenModule`/`RegistrationModule` — the root `AppModule`'s `JwtModule`
 * registration is not shared/global, each module that needs `JwtService`
 * registers its own). The `secret`/`signOptions` passed here are
 * effectively unused defaults — `ConnectorRegistrationService` always
 * passes explicit `secret`/`expiresIn` per `sign()`/`verify()` call (a
 * connector access token and a connector refresh token use two different
 * secrets, neither of which is this module-level default), but
 * `JwtModule.registerAsync()` requires some default to construct the
 * underlying `JwtService`.
 *
 * `TenantConnectorPairing` and `Tenant` are read-only dependencies here
 * (this module never creates or modifies a `Tenant`, and only transitions
 * an existing `TenantConnectorPairing` row's `status`) — imported via
 * `TypeOrmModule.forFeature` directly rather than importing
 * `TenantProvisioningModule`/`TenantModule` wholesale, to avoid pulling in
 * either module's full provider graph for two repositories.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ConnectorInstance, TenantConnectorPairing, Tenant]),
    BullModule.registerQueue({ name: QUEUE_NAMES.CONNECTOR_JOBS }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.connectorSecret'),
        signOptions: { expiresIn: config.get<string>('jwt.connectorExpiresIn', '15m') },
      }),
    }),
  ],
  controllers: [ConnectorRegistrationController],
  providers: [
    ConnectorRegistrationService,
    ConnectorGateway,
    ConnectorJobDispatchService,
    ConnectorJobDispatchProcessor,
    ConnectorDirectoryService,
    RedisProvider,
  ],
  exports: [
    ConnectorRegistrationService,
    ConnectorGateway,
    ConnectorJobDispatchService,
    ConnectorDirectoryService,
  ],
})
export class ConnectorModule {}

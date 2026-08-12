import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvironmentSecretsProvider } from './secrets/environment-secrets.provider';
import { SECRETS_PROVIDER } from './tokens';

/**
 * PlatformInfrastructureModule aggregates foundational infrastructure
 * that supports the Platform Services and Business Modules.
 */
@Module({
  imports: [
    ConfigModule,
  ],
  providers: [
    {
      provide: SECRETS_PROVIDER,
      useClass: EnvironmentSecretsProvider,
    },
  ],
  exports: [
    SECRETS_PROVIDER,
  ],
})
export class PlatformInfrastructureModule {}

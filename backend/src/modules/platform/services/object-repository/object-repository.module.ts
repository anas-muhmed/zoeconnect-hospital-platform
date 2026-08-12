import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectRepositoryService } from './services/object-repository.service';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { IObjectStorageProvider } from './interfaces/object-storage-provider.interface';
import { STORAGE_PROVIDER } from '../../infrastructure/tokens';

/**
 * StorageModule -- Phase 2 ("Infrastructure Abstraction") DI wiring for the
 * object-storage seam, extended in Phase 3 ("Storage Providers") with
 * driver mode-selection.
 *
 * Both LocalStorageProvider and S3StorageProvider are always registered as
 * ordinary Nest providers (cheap -- S3StorageProvider's constructor just
 * builds an S3Client, it doesn't connect eagerly), but only ONE of them is
 * ever bound to STORAGE_PROVIDER / registered as ObjectRepositoryService's
 * active provider, selected by the STORAGE_DRIVER env var
 * (env.validation.ts: 'local' | 's3', default 'local'). This preserves
 * every existing deployment's behavior exactly -- STORAGE_DRIVER unset or
 * 'local' is byte-for-byte the same wiring Phase 2 shipped. 's3' is opt-in
 * only, and env.validation.ts already refuses to boot if STORAGE_DRIVER=s3
 * is set without the required S3_* fields, so this factory can assume they
 * exist whenever it reaches the 's3' branch.
 */
@Module({
  providers: [
    LocalStorageProvider,
    S3StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ConfigService, local: LocalStorageProvider, s3: S3StorageProvider): IObjectStorageProvider =>
        config.get<string>('STORAGE_DRIVER', 'local') === 's3' ? s3 : local,
      inject: [ConfigService, LocalStorageProvider, S3StorageProvider],
    },
    {
      provide: ObjectRepositoryService,
      useFactory: (provider: IObjectStorageProvider) => {
        const service = new ObjectRepositoryService();
        service.registerProvider(provider, true);
        return service;
      },
      inject: [STORAGE_PROVIDER],
    },
  ],
  exports: [ObjectRepositoryService, STORAGE_PROVIDER],
})
export class StorageModule {}

import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { BackupStorageDriver, BackupStoragePurpose } from '../entities/backup-storage-config.entity';

const DRIVERS: BackupStorageDriver[] = ['local', 's3', 'azure', 'gcs', 'sftp', 'network_share'];
const PURPOSES: BackupStoragePurpose[] = ['manual', 'scheduled', 'both'];

export class CreateStorageProviderDto {
  @ApiProperty({ example: 'S3 Offsite' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: DRIVERS })
  @IsIn(DRIVERS)
  driver: BackupStorageDriver;

  @ApiPropertyOptional({ description: 'Driver-specific connection details, both non-secret fields (bucket/region/host/path) and credentials (secret access key, password, connection string, ...). Credential sub-fields are transparently split out and AES-256-GCM-encrypted at rest by BackupCredentialCipherService before this row is persisted -- submit everything here in plaintext, as before.' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ enum: PURPOSES, default: 'both', description: 'Whether this destination may be used for manual backups, scheduled backups, or both.' })
  @IsOptional()
  @IsIn(PURPOSES)
  purpose?: BackupStoragePurpose;

  @ApiPropertyOptional({ example: 'production', description: 'Optional environment tag (development/uat/production/...). Null means "applies in every environment" -- self-hosted installs typically leave this unset.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  environment?: string;

  @ApiPropertyOptional({ default: 100, description: 'Lower runs first in failover write mode; also the tie-breaker for default-destination resolution.' })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ default: false, description: 'Only meaningful for a platform-level destination (no tenant). When true, every tenant may use this destination in cloud mode; when false (default), only the destination\'s own tenant (or self-hosted installs) may use it.' })
  @IsOptional()
  @IsBoolean()
  shareable?: boolean;
}

export class UpdateStorageProviderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Same semantics as CreateStorageProviderDto.config -- only supplied fields are updated; credentials are re-encrypted if included.' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: PURPOSES })
  @IsOptional()
  @IsIn(PURPOSES)
  purpose?: BackupStoragePurpose;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  environment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shareable?: boolean;
}

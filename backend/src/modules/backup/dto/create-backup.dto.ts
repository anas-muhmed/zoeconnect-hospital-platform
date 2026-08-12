import {
  IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { BackupModuleName, BackupType, BackupWriteMode } from '../entities/backup-job.entity';

const BACKUP_MODULES: BackupModuleName[] = ['database', 'files', 'configuration', 'licensing', 'tenant_configuration'];
const BACKUP_TYPES: BackupType[] = ['full', 'incremental', 'differential', 'manual', 'scheduled', 'pre_upgrade', 'pre_restore'];
const WRITE_MODES: BackupWriteMode[] = ['redundant_all', 'failover'];

export class CreateBackupDto {
  @ApiPropertyOptional({ enum: BACKUP_TYPES, default: 'manual' })
  @IsOptional()
  @IsIn(BACKUP_TYPES)
  type?: BackupType;

  @ApiPropertyOptional({ type: [String], enum: BACKUP_MODULES })
  @IsOptional()
  @IsArray()
  @IsIn(BACKUP_MODULES, { each: true })
  modules?: BackupModuleName[];

  @ApiPropertyOptional({ description: 'BackupStorageConfig id; defaults to the tenant/installation default destination. Ignored when storageConfigIds is supplied.' })
  @IsOptional()
  @IsUUID()
  storageConfigId?: string;

  @ApiPropertyOptional({ type: [String], description: '2+ BackupStorageConfig ids to write this backup to simultaneously (redundancy/failover, points 8/9 of the storage-hardening brief). Takes precedence over storageConfigId.' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  storageConfigIds?: string[];

  @ApiPropertyOptional({ enum: WRITE_MODES, default: 'failover', description: 'How storageConfigIds is written: redundant_all writes to every destination (job is "partial" if some fail), failover tries in priority order and stops at the first success.' })
  @IsOptional()
  @IsIn(WRITE_MODES)
  writeMode?: BackupWriteMode;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  encrypt?: boolean;

  @ApiPropertyOptional({ description: 'Required when encrypt=true and no default passphrase is configured' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  passphrase?: string;
}

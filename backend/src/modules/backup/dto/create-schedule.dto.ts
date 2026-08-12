import {
  IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { BackupModuleName, BackupType, BackupWriteMode } from '../entities/backup-job.entity';

const BACKUP_MODULES: BackupModuleName[] = ['database', 'files', 'configuration', 'licensing', 'tenant_configuration'];
const BACKUP_TYPES: BackupType[] = ['full', 'incremental', 'differential'];
const WRITE_MODES: BackupWriteMode[] = ['redundant_all', 'failover'];

export class CreateScheduleDto {
  @ApiProperty({ example: 'Nightly full backup' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: '0 2 * * *', description: 'Standard 5-field cron expression' })
  @IsString()
  @IsNotEmpty()
  cronExpression: string;

  @ApiPropertyOptional({ enum: BACKUP_TYPES, default: 'full' })
  @IsOptional()
  @IsIn(BACKUP_TYPES)
  backupType?: BackupType;

  @ApiPropertyOptional({ type: [String], enum: BACKUP_MODULES })
  @IsOptional()
  @IsArray()
  @IsIn(BACKUP_MODULES, { each: true })
  modules?: BackupModuleName[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storageConfigId?: string;

  @ApiPropertyOptional({ type: [String], description: '2+ BackupStorageConfig ids this schedule writes to simultaneously. Takes precedence over storageConfigId.' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  storageConfigIds?: string[];

  @ApiPropertyOptional({ enum: WRITE_MODES, default: 'failover' })
  @IsOptional()
  @IsIn(WRITE_MODES)
  writeMode?: BackupWriteMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  encrypt?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional({ enum: BACKUP_TYPES })
  @IsOptional()
  @IsIn(BACKUP_TYPES)
  backupType?: BackupType;

  @ApiPropertyOptional({ type: [String], enum: BACKUP_MODULES })
  @IsOptional()
  @IsArray()
  @IsIn(BACKUP_MODULES, { each: true })
  modules?: BackupModuleName[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storageConfigId?: string;

  @ApiPropertyOptional({ type: [String], description: '2+ BackupStorageConfig ids this schedule writes to simultaneously. Takes precedence over storageConfigId.' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  storageConfigIds?: string[];

  @ApiPropertyOptional({ enum: WRITE_MODES, default: 'failover' })
  @IsOptional()
  @IsIn(WRITE_MODES)
  writeMode?: BackupWriteMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  encrypt?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

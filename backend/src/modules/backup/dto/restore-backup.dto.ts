import {
  IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { BackupModuleName } from '../entities/backup-job.entity';
import type { RestoreMode } from '../entities/restore-job.entity';

const RESTORE_MODES: RestoreMode[] = [
  'entire_application', 'database_only', 'files_only',
  'configuration_only', 'selected_modules', 'selected_tenant',
];
const BACKUP_MODULES: BackupModuleName[] = ['database', 'files', 'configuration', 'licensing', 'tenant_configuration'];

export class RestoreBackupDto {
  @ApiProperty({ description: 'BackupJob id to restore from' })
  @IsUUID()
  @IsNotEmpty()
  backupId: string;

  @ApiPropertyOptional({ enum: RESTORE_MODES, default: 'entire_application' })
  @IsOptional()
  @IsIn(RESTORE_MODES)
  mode?: RestoreMode;

  @ApiPropertyOptional({ type: [String], enum: BACKUP_MODULES, description: 'Required when mode=selected_modules' })
  @IsOptional()
  @IsArray()
  @IsIn(BACKUP_MODULES, { each: true })
  modules?: BackupModuleName[];

  @ApiProperty({
    description: 'Must be explicitly true to proceed. This is the spec-required "confirmation required" gate — ' +
      'the restore workflow never runs without it, regardless of caller permissions.',
  })
  @IsBoolean()
  confirm: boolean;

  @ApiPropertyOptional({ description: 'Required if the source backup is encrypted' })
  @IsOptional()
  @IsString()
  passphrase?: string;
}

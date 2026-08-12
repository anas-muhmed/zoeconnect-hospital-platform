import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyBackupDto {
  @ApiProperty({ description: 'BackupJob id to verify' })
  @IsUUID()
  @IsNotEmpty()
  backupId: string;

  @ApiPropertyOptional({ description: 'Required if the backup is encrypted' })
  @IsOptional()
  @IsString()
  passphrase?: string;
}

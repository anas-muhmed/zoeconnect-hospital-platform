import {
  IsString, IsOptional, IsUUID, IsDateString, IsIn, IsNotEmpty, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCapaDto {
  @ApiPropertyOptional({ description: 'Link to a specific RCA' })
  @IsUUID()
  @IsOptional()
  rcaId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'CORRECTIVE | PREVENTIVE' })
  @IsIn(['CORRECTIVE', 'PREVENTIVE'])
  capaType: string;

  @ApiProperty({ description: 'Owner user UUID' })
  @IsUUID()
  ownerId: string;

  @ApiPropertyOptional({ description: 'Owner name snapshot (pre-filled from employee lookup)' })
  @IsString()
  @IsOptional()
  ownerName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({ description: 'Due date (YYYY-MM-DD)' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ description: 'Priority: LOW | MEDIUM | HIGH | CRITICAL' })
  @IsString()
  @IsOptional()
  priorityCode?: string;
}

export class UpdateCapaDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsString()
  @IsOptional()
  ownerName?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  priorityCode?: string;

  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'REOPENED'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  completionNotes?: string;
}

import { IsString, IsOptional, IsUUID, IsBoolean, IsArray, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTriageDto {
  @ApiPropertyOptional({ description: 'Assign to specific investigator ID' })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Priority override code' })
  @IsString()
  @IsOptional()
  priorityCode?: string;

  @ApiPropertyOptional({ description: 'Override response SLA in hours' })
  @IsInt()
  @Min(1)
  @IsOptional()
  responseSlaHours?: number;

  @ApiProperty({ description: 'Whether immediate escalation is required' })
  @IsBoolean()
  @IsOptional()
  escalationRequired?: boolean;

  @ApiPropertyOptional({ description: 'Roles to notify for escalation' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  escalationRoles?: string[];

  @ApiProperty({ description: 'Whether immediate containment action is required' })
  @IsBoolean()
  @IsOptional()
  containmentRequired?: boolean;

  @ApiPropertyOptional({ description: 'Notes on containment action taken' })
  @IsString()
  @IsOptional()
  containmentNotes?: string;

  @ApiPropertyOptional({ description: 'General triage assessment notes' })
  @IsString()
  @IsOptional()
  triageNotes?: string;
}

export class UpdateTriageDto extends CreateTriageDto {}

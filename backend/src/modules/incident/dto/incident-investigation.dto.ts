import { IsString, IsOptional, IsUUID, IsArray, IsDateString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvestigationDto {
  @ApiProperty({ description: 'Investigation title / scope statement' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @ApiProperty({ description: 'Lead investigator UUID (ZoeConnect User or HIS employee)' })
  @IsUUID()
  leadId: string;

  @ApiPropertyOptional({ description: 'Additional team member UUIDs' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  teamMemberIds?: string[];

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startedAt?: string;
}

export class UpdateInvestigationDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsUUID()
  @IsOptional()
  leadId?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  teamMemberIds?: string[];

  @IsString()
  @IsOptional()
  timelineNotes?: string;

  @IsString()
  @IsOptional()
  findings?: string;

  @IsString()
  @IsOptional()
  recommendations?: string;

  @IsDateString()
  @IsOptional()
  completedAt?: string;
}

export class AddStatementDto {
  @ApiProperty({ description: 'WITNESS | STAFF_INVOLVED | EXPERT' })
  @IsString()
  @IsNotEmpty()
  statementType: string;

  @ApiProperty({ description: 'Full name of the person giving the statement' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  personName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  personRole?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({ description: 'The full statement text' })
  @IsString()
  @IsNotEmpty()
  statementText: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  statementDate?: string;
}

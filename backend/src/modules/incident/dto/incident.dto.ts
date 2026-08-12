import {
  IsString, IsOptional, IsUUID, IsDateString, IsBoolean,
  IsArray, IsIn, IsNumber, MinLength, MaxLength, Min, Max,
  IsNotEmpty, ValidateNested, IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

// ── Status / Stage enums ─────────────────────────────────────────────────────
export const INCIDENT_STATUSES = [
  'DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED',
  'TRIAGE', 'CONTAINMENT', 'INVESTIGATION',
  'RCA_PENDING', 'CAPA_PENDING', 'VERIFICATION',
  'CLOSED', 'ARCHIVED',
] as const;
export type IncidentStatus = typeof INCIDENT_STATUSES[number];

// ── Create Incident ───────────────────────────────────────────────────────────
export class CreateIncidentDto {
  @ApiProperty({ description: 'Incident category UUID' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ description: 'Incident type UUID' })
  @IsUUID()
  @IsOptional()
  typeId?: string;

  @ApiProperty({ description: 'Severity code (LOW|MODERATE|HIGH|CRITICAL)' })
  @IsString()
  @IsNotEmpty()
  severityCode: string;

  @ApiPropertyOptional({ description: 'Priority code' })
  @IsString()
  @IsOptional()
  priorityCode?: string;

  @ApiProperty({ description: 'Date and time the incident occurred (ISO 8601)' })
  @IsDateString()
  incidentDate: string;

  @ApiProperty({ description: 'Department where the incident occurred' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  department: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  ward?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  location?: string;

  @ApiProperty({ description: 'Detailed incident description' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description: string;

  @ApiPropertyOptional({ description: 'Immediate action taken at the scene' })
  @IsString()
  @IsOptional()
  immediateAction?: string;

  @ApiPropertyOptional({ description: 'Patient MRN (triggers Oracle HIS lookup)' })
  @IsString()
  @IsOptional()
  patientMrn?: string;

  @ApiPropertyOptional({ description: 'Employee ID (for staff-related incidents)' })
  @IsString()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Submit as anonymous (hides reporter name)' })
  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;

  @ApiPropertyOptional({ description: 'Is this a near-miss incident?' })
  @IsBoolean()
  @IsOptional()
  isNearMiss?: boolean;

  @ApiPropertyOptional({ description: 'Is this a sentinel event?' })
  @IsBoolean()
  @IsOptional()
  isSentinelEvent?: boolean;

  @ApiPropertyOptional({ description: 'Optional tags array' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Initial likelihood score (1–5) for risk matrix' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  likelihood?: number;

  @ApiPropertyOptional({ description: 'Initial impact score (1–5) for risk matrix' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  impact?: number;
}

// ── Update Incident ───────────────────────────────────────────────────────────
export class UpdateIncidentDto extends PartialType(CreateIncidentDto) {}

// ── Assign Incident ───────────────────────────────────────────────────────────
export class AssignIncidentDto {
  @ApiProperty({ description: 'UUID of lead investigator (ZoeConnect User)' })
  @IsUUID()
  investigatorId: string;

  @ApiPropertyOptional({ description: 'Optional team member UUIDs' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  teamMemberIds?: string[];
}

// ── List / Filter ─────────────────────────────────────────────────────────────
export class ListIncidentsDto {
  @IsOptional()
  @IsIn(INCIDENT_STATUSES as unknown as string[])
  status?: IncidentStatus;

  @IsOptional()
  @IsString()
  severityCode?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  patientMrn?: string;

  @IsOptional()
  @IsUUID()
  investigatorId?: string;

  @IsOptional()
  @IsBoolean()
  isNearMiss?: boolean;

  @IsOptional()
  @IsBoolean()
  isSentinelEvent?: boolean;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['incidentNumber', 'status', 'severityCode', 'priorityCode', 'department', 'incidentDate', 'createdAt'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ── Residual Risk ─────────────────────────────────────────────────────────────
export class UpdateResidualRiskDto {
  @ApiProperty({ description: 'Likelihood 1–5' })
  @IsInt() @Min(1) @Max(5)
  likelihood: number;

  @ApiProperty({ description: 'Impact 1–5' })
  @IsInt() @Min(1) @Max(5)
  impact: number;

  @ApiProperty({ description: 'Stage: PRE_CAPA | POST_CAPA' })
  @IsIn(['PRE_CAPA', 'POST_CAPA'])
  stage: string;
}

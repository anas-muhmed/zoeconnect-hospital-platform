import {
  IsString, IsOptional, IsBoolean, IsArray, IsInt, Min, Max, IsIn, IsNotEmpty, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Category ─────────────────────────────────────────────────────────────────
export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  displayOrder?: number;
}

export class UpdateCategoryDto extends CreateCategoryDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ── Type ─────────────────────────────────────────────────────────────────────
export class CreateTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateTypeDto extends CreateTypeDto {}

// ── Severity ─────────────────────────────────────────────────────────────────
export class CreateSeverityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ description: 'Response SLA in hours' })
  @IsInt()
  @Min(1)
  @IsOptional()
  slaResponseHours?: number;

  @ApiPropertyOptional({ description: 'Investigation SLA in hours' })
  @IsInt()
  @Min(1)
  @IsOptional()
  slaInvestigationHours?: number;

  @ApiPropertyOptional({ description: 'CAPA SLA in days' })
  @IsInt()
  @Min(1)
  @IsOptional()
  slaCapaDays?: number;

  @ApiPropertyOptional({ description: 'Closure SLA in days' })
  @IsInt()
  @Min(1)
  @IsOptional()
  slaClosureDays?: number;

  @ApiPropertyOptional({ description: 'Roles to notify for this severity' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  notifyRoles?: string[];

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  displayOrder?: number;
}

// ── Risk Matrix ───────────────────────────────────────────────────────────────
export class UpdateRiskMatrixCellDto {
  @ApiProperty({ description: 'Likelihood 1–5' })
  @IsInt() @Min(1) @Max(5)
  likelihood: number;

  @ApiProperty({ description: 'Impact 1–5' })
  @IsInt() @Min(1) @Max(5)
  impact: number;

  @ApiProperty({ description: 'LOW | MEDIUM | HIGH | CRITICAL' })
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  riskLevel: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  color?: string;
}

// ── Notification Rule ─────────────────────────────────────────────────────────
export class CreateNotificationRuleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'INCIDENT_CREATED | CAPA_OVERDUE | INCIDENT_CLOSED ...' })
  @IsString()
  @IsNotEmpty()
  triggerEvent: string;

  @ApiPropertyOptional({ description: 'Array of {field, op, value} conditions' })
  @IsArray()
  @IsOptional()
  conditions?: Array<{ field: string; op: string; value: unknown }>;

  @ApiPropertyOptional({ description: 'Role names to notify' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  notifyRoles?: string[];

  @ApiPropertyOptional({ description: 'Specific user UUIDs to notify' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  notifyUserIds?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  channel?: string;
}

export class UpdateNotificationRuleDto extends CreateNotificationRuleDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ── Notification Role (incident-scoped, distinct from platform RBAC) ─────────
export class CreateNotificationRoleDto {
  @ApiProperty({ description: 'The role code referenced by notifyRoles arrays, e.g. RISK_MANAGER' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateNotificationRoleDto extends CreateNotificationRoleDto {}

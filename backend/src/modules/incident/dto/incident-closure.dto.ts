import {
  IsString, IsOptional, IsBoolean, IsInt, Min, Max, IsNotEmpty, IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CloseIncidentDto {
  @ApiProperty({ description: 'Closure notes and summary of resolution' })
  @IsString()
  @IsNotEmpty()
  closureNotes: string;

  @ApiPropertyOptional({ description: 'Lessons learned for organizational learning' })
  @IsString()
  @IsOptional()
  lessonsLearned?: string;

  @ApiPropertyOptional({ description: 'Final likelihood 1–5 for post-closure risk assessment' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  finalLikelihood?: number;

  @ApiPropertyOptional({ description: 'Final impact 1–5 for post-closure risk assessment' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  finalImpact?: number;

  @ApiPropertyOptional({ description: 'If TRUE, residualRiskNotes is required' })
  @IsBoolean()
  @IsOptional()
  residualRiskAccepted?: boolean;

  @ApiPropertyOptional({ description: 'Explanation of why residual risk is accepted' })
  @IsString()
  @IsOptional()
  residualRiskNotes?: string;

  @ApiPropertyOptional({ description: 'UUID of approving authority' })
  @IsUUID()
  @IsOptional()
  approvedById?: string;
}

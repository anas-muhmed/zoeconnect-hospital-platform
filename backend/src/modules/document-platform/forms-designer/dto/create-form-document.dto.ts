import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFormDocumentDto {
  @ApiProperty({ description: 'Human-readable form template name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Form category', enum: ['registration', 'consent', 'assessment', 'custom'] })
  @IsIn(['registration', 'consent', 'assessment', 'custom'])
  category: string;

  @ApiPropertyOptional({ description: 'Whether branches/departments may override this template (ADR-011)' })
  @IsOptional()
  @IsBoolean()
  isMultiBranch?: boolean;
}

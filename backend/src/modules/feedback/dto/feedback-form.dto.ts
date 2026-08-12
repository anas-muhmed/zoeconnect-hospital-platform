import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeedbackFormDto {
  @ApiProperty({ example: 'Outpatient Visit Feedback' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

/**
 * Deliberately has NO `status` field -- status only ever changes via the
 * dedicated /publish, /unpublish, /archive endpoints, each of which has its
 * own validation (publish requires real content; a PUBLISHED form rejects
 * further edits until unpublished). Allowing a raw PATCH to flip `status`
 * would let a client bypass both.
 */
export class UpdateFeedbackFormDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

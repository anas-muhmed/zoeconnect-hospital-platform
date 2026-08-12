import { IsOptional, IsInt, Min, Max, IsNumber, IsString, MaxLength, IsArray, ArrayMinSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Every field explicit and decorated, unlike CmsSettingsController's
 * `Partial<Omit<CMSSettings, ...>>` inline type -- that's a TS-only
 * utility type, erased at runtime, so the global ValidationPipe's
 * `whitelist: true` can't see any real per-field metadata on it (the same
 * class of bug fixed earlier in this module for `SubmitAnswerDto.value`,
 * see module memory). An explicit DTO class with `@IsOptional()` on every
 * field sidesteps that risk entirely.
 */
export class UpdateFeedbackSettingsDto {
  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1) @Max(100)
  maxSubmissionsPerDevice?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1) @Max(720)
  submissionLimitWindowHours?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1) @Max(3600)
  duplicateSubmissionWindowSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(1) @Max(5)
  defaultGoogleReviewThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  defaultGoogleReviewThankYouMessage?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  defaultGoogleReviewInvitationMessage?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  defaultThankYouMessage?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1) @Max(60)
  defaultSplashDurationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1) @Max(60)
  minSplashDurationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1) @Max(120)
  maxSplashDurationSeconds?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsString({ each: true })
  complaintCategories?: string[];

  @ApiPropertyOptional({ description: 'Meta-approved WhatsApp template name, or omit/blank to disable the resolution notification' })
  @IsOptional() @IsString() @MaxLength(200)
  complaintResolvedWhatsappTemplate?: string;
}

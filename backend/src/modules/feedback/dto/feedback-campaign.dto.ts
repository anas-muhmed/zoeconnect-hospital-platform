import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID, IsBoolean, IsUrl, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Reception Survey' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Feedback form this campaign collects responses against' })
  @IsUUID()
  formId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Enable the post-submission Google Review prompt for this campaign' })
  @IsOptional()
  @IsBoolean()
  googleReviewEnabled?: boolean;

  @ApiPropertyOptional({ description: "Hospital's Google Review link (write-review URL for the listing)" })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  googleReviewUrl?: string;

  @ApiPropertyOptional({ description: 'Minimum overall rating (1-5) that triggers the Google Review prompt', default: 4 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  googleReviewThreshold?: number;

  @ApiPropertyOptional({ description: 'Custom thank-you message shown after submission' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  googleReviewThankYouMessage?: string;

  @ApiPropertyOptional({ description: 'Custom message inviting the patient to leave a Google review' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  googleReviewInvitationMessage?: string;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Swap which form this campaign (and therefore every QR pointing at it) resolves to' })
  @IsOptional()
  @IsUUID()
  formId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Enable the post-submission Google Review prompt for this campaign' })
  @IsOptional()
  @IsBoolean()
  googleReviewEnabled?: boolean;

  @ApiPropertyOptional({ description: "Hospital's Google Review link (write-review URL for the listing)" })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  googleReviewUrl?: string;

  @ApiPropertyOptional({ description: 'Minimum overall rating (1-5) that triggers the Google Review prompt', default: 4 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  googleReviewThreshold?: number;

  @ApiPropertyOptional({ description: 'Custom thank-you message shown after submission' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  googleReviewThankYouMessage?: string;

  @ApiPropertyOptional({ description: 'Custom message inviting the patient to leave a Google review' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  googleReviewInvitationMessage?: string;
}

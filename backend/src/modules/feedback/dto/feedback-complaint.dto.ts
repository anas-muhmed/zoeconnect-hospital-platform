import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID, IsEmail, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * `category` is deliberately just a free-length string, not an `@IsIn(...)`
 * enum -- the actual dropdown options come from `FeedbackSettings.complaintCategories`
 * (module-wide, admin-editable via `PATCH /feedback/settings`) and are handed
 * to the public portal through `FeedbackPublicService.resolve()`'s response.
 * Validating against a hardcoded list here would silently reject a category an
 * admin just added.
 */
export class SubmitComplaintDto {
  @ApiProperty({ description: 'The submissionId returned by POST /feedback/public/:token/submit' })
  @IsUUID()
  submissionId: string;

  @ApiProperty({ example: 'Waiting Time' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ description: 'Optional -- only if the patient wants to be contacted about this' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  contactEmail?: string;
}

export class UpdateComplaintDto {
  @ApiPropertyOptional({ enum: ['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] })
  @IsOptional()
  @IsIn(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

  @ApiPropertyOptional({ description: 'user.id of the staff member handling this complaint' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolutionNotes?: string;
}

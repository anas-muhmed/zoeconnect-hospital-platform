import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCvSettingsDto {
  @IsOptional()
  @IsBoolean()
  requireAdmissionApproval?: boolean;
}

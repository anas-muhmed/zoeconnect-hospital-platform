import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnrollPatientDto {
  @ApiProperty({ description: 'Patient MRN / UHID from HIS', example: 'CGHS-00012345' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  patientMrn: string;

  @ApiPropertyOptional({ description: 'Patient full name (fallback if HIS unavailable)', example: 'Ramesh Kumar' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  patientName?: string;

  @ApiPropertyOptional({ description: 'Override card category ID; if omitted, Silver is auto-assigned' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Patient mobile number (E.164) for WhatsApp welcome notification', example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

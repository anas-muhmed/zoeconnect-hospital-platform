import { IsString, IsOptional, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyCapaDto {
  @ApiProperty({ description: 'APPROVED | REJECTED | NEED_MORE_EVIDENCE' })
  @IsIn(['APPROVED', 'REJECTED', 'NEED_MORE_EVIDENCE'])
  outcome: string;

  @ApiPropertyOptional({ description: 'Verification notes or rejection reason' })
  @IsString()
  @IsOptional()
  notes?: string;
}

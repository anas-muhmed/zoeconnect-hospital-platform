import { IsArray, IsString, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitLicenseRequestDto {
  @ApiProperty({
    example: ['LOYALTY', 'QUEUE'],
    description: 'Modules being requested from vendor',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  requestedModules: string[];

  @ApiPropertyOptional({ example: 'We need loyalty module for our outpatient billing integration.' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

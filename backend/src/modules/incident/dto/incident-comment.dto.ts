import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class CreateIncidentCommentDto {
  @ApiProperty({ description: 'The text content of the comment' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ enum: ['PUBLIC', 'INTERNAL'], default: 'INTERNAL', description: 'Visibility of the comment' })
  @IsEnum(['PUBLIC', 'INTERNAL'])
  @IsOptional()
  visibility?: 'PUBLIC' | 'INTERNAL';
}

import {
  IsString, IsOptional, IsUUID, IsIn, IsInt, Min, Max, IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRcaDto {
  @ApiPropertyOptional({ description: 'Link to a specific investigation' })
  @IsUUID()
  @IsOptional()
  investigationId?: string;

  @ApiProperty({ description: 'RCA method: FIVE_WHY | FISHBONE' })
  @IsIn(['FIVE_WHY', 'FISHBONE'])
  method: string;
}

export class UpdateRcaDto {
  @IsString()
  @IsOptional()
  summary?: string;

  @IsString()
  @IsOptional()
  rootCause?: string;

  @IsIn(['IN_PROGRESS', 'COMPLETED'])
  @IsOptional()
  status?: string;
}

export class AddFiveWhyDto {
  @ApiProperty({ description: 'Why number 1–5' })
  @IsInt()
  @Min(1)
  @Max(5)
  whyNumber: number;

  @ApiProperty({ description: 'The "Why?" question text' })
  @IsString()
  @IsNotEmpty()
  whyText: string;

  @ApiPropertyOptional({ description: 'The "Because..." answer' })
  @IsString()
  @IsOptional()
  because?: string;
}

export class UpsertFishboneNodeDto {
  @ApiPropertyOptional({ description: 'Node UUID for update; omit to create' })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiProperty({ description: 'PEOPLE | PROCESS | EQUIPMENT | ENVIRONMENT | POLICY | COMMUNICATION' })
  @IsIn(['PEOPLE', 'PROCESS', 'EQUIPMENT', 'ENVIRONMENT', 'POLICY', 'COMMUNICATION'])
  category: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  causeText: string;

  @ApiPropertyOptional({ description: 'Parent node UUID for sub-causes' })
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ description: 'UI layout coordinates' })
  @IsOptional()
  layout?: Record<string, unknown>;
}

import { Type } from 'class-transformer';
import {
  IsArray, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested,
} from 'class-validator';

export class DiagnosisItemDto {
  @IsString() name: string;
  @IsString() confidence: string;
  @IsOptional() @IsArray() recommendedTests?: string[];
}

export class CreateConsultationDto {
  @IsOptional() @IsString() patientName?: string;
  @IsOptional() @Type(() => Number) @IsInt() patientAge?: number;
  @IsOptional() @IsString() patientGender?: string;
  @IsOptional() @IsString() audioPath?: string;
  @IsOptional() @IsString() audioFileName?: string;
  @IsOptional() @IsString() duration?: string;

  @IsString() @IsNotEmpty() transcript: string;

  @IsOptional() @IsArray() symptoms?: string[];
  @IsOptional() @IsArray() observations?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosisItemDto)
  diagnoses?: DiagnosisItemDto[];
}

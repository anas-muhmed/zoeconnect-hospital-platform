import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class TranscribeAudioDto {
  @IsString() @IsNotEmpty() audioId: string;
  @IsOptional() @IsIn(['english', 'malayalam']) language?: 'english' | 'malayalam';
}

export class ExtractSymptomsDto {
  @IsString() @MinLength(5) transcript: string;
}

export class GenerateDiagnosisDto {
  @IsArray() symptoms: string[];
  @IsOptional() @IsArray() observations?: string[];
}

export class ZoiBotDto {
  @IsString() @IsNotEmpty() userInput: string;
}

import {
  IsString, IsOptional, IsDateString, IsArray, IsEnum, IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EicDiscipline } from '../../common/enums/discipline.enum';

export class CreateEicEnrollmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  mrn: string;

  @ApiProperty()
  @IsDateString()
  admissionDate: string;

  @ApiProperty({ enum: EicDiscipline, isArray: true })
  @IsArray()
  @IsEnum(EicDiscipline, { each: true })
  activeDisciplines: EicDiscipline[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryDiagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  referralSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignTherapistDto {
  @ApiProperty()
  @IsUUID()
  therapistId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  therapistName: string;

  @ApiProperty({ enum: EicDiscipline })
  @IsEnum(EicDiscipline)
  discipline: EicDiscipline;
}

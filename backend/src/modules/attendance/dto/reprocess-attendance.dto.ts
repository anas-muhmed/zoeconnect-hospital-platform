import { IsArray, IsDateString, IsIn, IsOptional } from 'class-validator';

export class ReprocessAttendanceWindowDto {
  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsOptional()
  @IsArray()
  @IsIn(['FAILED', 'DEAD_LETTER'], { each: true })
  statuses?: ('FAILED' | 'DEAD_LETTER')[];
}

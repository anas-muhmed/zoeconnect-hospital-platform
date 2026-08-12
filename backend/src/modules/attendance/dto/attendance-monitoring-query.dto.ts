import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AttendanceMonitoringDateQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class AttendanceMonitoringListQueryDto extends AttendanceMonitoringDateQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  module?: string;
}

export class AttendanceEmployeeTraceQueryDto extends AttendanceMonitoringDateQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}

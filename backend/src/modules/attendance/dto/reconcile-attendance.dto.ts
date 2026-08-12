import { IsDateString } from 'class-validator';

export class ReconcileAttendanceDto {
  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;
}


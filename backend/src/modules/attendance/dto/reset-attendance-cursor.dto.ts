import { IsDateString } from 'class-validator';

export class ResetAttendanceCursorDto {
  @IsDateString()
  fromDate: string;
}


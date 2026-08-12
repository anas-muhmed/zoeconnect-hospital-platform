import { IsNotEmpty, IsString } from 'class-validator';

export class AssignHousekeepingTaskDto {
  @IsString() @IsNotEmpty() taskId: string;
  @IsString() @IsNotEmpty() staffName: string;
}

export class HousekeepingTaskIdDto {
  @IsString() @IsNotEmpty() taskId: string;
}

import { IsEnum, IsString, IsUUID, IsOptional, IsDateString } from 'class-validator';
import { EicDiscipline } from '../../common/enums/discipline.enum';
import { AssignmentRole } from '../../entities/eic-enrollment-discipline-assignment.entity';

export class CreateDisciplineAssignmentDto {
  @IsEnum(EicDiscipline)
  discipline: EicDiscipline;

  @IsUUID()
  therapistId: string;

  @IsEnum(AssignmentRole)
  role: AssignmentRole;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsString()
  assignmentReason?: string;
}

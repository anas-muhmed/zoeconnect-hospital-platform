import {
  IsString, IsNotEmpty, MaxLength, IsOptional, IsArray, IsUUID, IsInt,
  IsBoolean, IsEnum, IsIn, ValidateNested, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackQuestionType } from '../entities/feedback-question-type.enum';

export class CreateQuestionDto {
  @ApiProperty({ enum: FeedbackQuestionType })
  @IsEnum(FeedbackQuestionType)
  questionType: FeedbackQuestionType;

  @ApiProperty({ example: 'How would you rate your visit today?' })
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  helpText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  placeholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  minLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultValue?: string;

  @ApiPropertyOptional({ description: 'Type-specific settings (NPS labels, star count, emoji set, etc.)' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateQuestionDto {
  @ApiPropertyOptional({ enum: FeedbackQuestionType })
  @IsOptional()
  @IsEnum(FeedbackQuestionType)
  questionType?: FeedbackQuestionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  questionText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  helpText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  placeholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  minLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class ReorderQuestionsDto {
  @ApiProperty({ type: [String], description: 'Question UUIDs in the desired display order' })
  @IsArray()
  @IsUUID('4', { each: true })
  questionIds: string[];
}

// -- Options: the builder saves a question's whole option list at once (add/remove/reorder
// in the UI, then one PUT) rather than per-option CRUD endpoints -- simpler for a drag-reorder
// list editor, and the service diffs it against what's stored (see FeedbackQuestionService.setOptions).

export class QuestionOptionInputDto {
  @ApiPropertyOptional({ description: 'Omit for a new option; include to update an existing one' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  value: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class SetQuestionOptionsDto {
  @ApiProperty({ type: [QuestionOptionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options: QuestionOptionInputDto[];
}

// -- Conditions: same whole-list-replace pattern as options.

export class QuestionConditionInputDto {
  @ApiPropertyOptional({ description: 'Omit for a new condition; include to update an existing one' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiProperty({ description: 'The question whose answer is evaluated' })
  @IsUUID('4')
  sourceQuestionId: string;

  @ApiProperty({ enum: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'CONTAINS'] })
  @IsIn(['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'CONTAINS'])
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  comparisonValue: string;

  @ApiPropertyOptional({ enum: ['SHOW', 'HIDE'], default: 'SHOW' })
  @IsOptional()
  @IsIn(['SHOW', 'HIDE'])
  action?: 'SHOW' | 'HIDE';
}

export class SetQuestionConditionsDto {
  @ApiProperty({ type: [QuestionConditionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionConditionInputDto)
  conditions: QuestionConditionInputDto[];
}

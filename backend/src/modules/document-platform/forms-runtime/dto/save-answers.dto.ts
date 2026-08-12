import { IsObject, IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveAnswersDto {
  @ApiProperty({ description: 'Partial or full set of field answers keyed by fieldKey (autosave, Milestone 4)' })
  @IsObject()
  @IsNotEmpty()
  answers: Record<string, unknown>;

  @ApiProperty({ description: 'Expected version of the document instance for optimistic concurrency' })
  @IsNumber()
  @IsNotEmpty()
  version: number;
}

import { IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FinalizeInstanceDto {
  @ApiProperty({ description: 'Expected version of the document instance for optimistic concurrency' })
  @IsNumber()
  @IsNotEmpty()
  version: number;
}

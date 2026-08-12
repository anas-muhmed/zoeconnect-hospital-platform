import { IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { FormSchema } from '@hdsp/form-schema';

export class SaveFormVersionDto {
  @ApiProperty({ description: 'The full FormSchema JSON produced by the Designer canvas (ADR-001)' })
  @IsObject()
  @IsNotEmpty()
  schema: FormSchema;
}

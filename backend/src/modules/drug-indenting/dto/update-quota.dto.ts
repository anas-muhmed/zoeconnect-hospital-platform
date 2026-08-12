import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateQuotaDto {
  @Type(() => Number) @IsInt() @Min(0) quarterlyLimit: number;
}

import { IsInt, IsUUID, Min, Max } from 'class-validator';

export class CallTokenDto {
  @IsUUID()
  counterId: string;

  @IsInt()
  @Min(1)
  @Max(999)
  tokenNumber: number;
}

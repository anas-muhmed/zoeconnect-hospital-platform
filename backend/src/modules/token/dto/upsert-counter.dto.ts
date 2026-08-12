import { IsString, IsInt, IsOptional, MinLength, MaxLength, Min, Max } from 'class-validator';

export class CreateCounterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  displayOrder?: number;
}

export class UpdateCounterDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  displayOrder?: number;
}

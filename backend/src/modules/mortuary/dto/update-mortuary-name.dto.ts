import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateMortuaryNameDto {
  @IsString()
  @IsNotEmpty()
  mortuaryName: string;
}

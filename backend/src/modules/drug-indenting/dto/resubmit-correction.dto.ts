import { Type } from 'class-transformer';
import {
  IsArray, IsOptional, IsString, ValidateNested,
} from 'class-validator';

export class DrugAlternativeInputDto {
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() marketer?: string;
  @IsOptional() mrpPerPack?: number | string;
  @IsOptional() ratePerPack?: number | string;
  @IsOptional() gstPercent?: number | string;
  @IsOptional() qty?: number | string;
  @IsOptional() offer?: number | string;
  @IsOptional() negorate?: number | string;
  @IsOptional() @IsString() stock?: string;
  @IsOptional() purchaseQty?: number | string;
  @IsOptional() @IsString() consultant?: string;
  @IsOptional() saleQty?: number | string;
  @IsOptional() pack?: string | number;
  @IsOptional() @IsString() introducedOn?: string;
  @IsOptional() @IsString() remark?: string;
}

export class ResubmitCorrectionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DrugAlternativeInputDto)
  alternatives?: DrugAlternativeInputDto[];

  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() comparisonType?: string;
  @IsOptional() existingGenericData?: unknown;
}

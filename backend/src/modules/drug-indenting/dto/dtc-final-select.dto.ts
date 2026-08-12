import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsOptional, IsString, ValidateNested,
} from 'class-validator';

export class DtcRecommendationItemDto {
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() reasons?: string[];
  @IsOptional() isOriginal?: boolean;
  @IsOptional() @IsString() alternativeId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class DtcAlternativeRemarkDto {
  @IsString() altId: string;
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsString() negotiationRemarks?: string;
}

export class DtcFinalSelectDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DtcRecommendationItemDto)
  recommendations?: DtcRecommendationItemDto[];

  @IsOptional() @IsString() selectedAlternativeId?: string;
  @IsOptional() @IsIn(['original', 'alternative']) selectionType?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() dtcSelectedBrand?: string;
  @IsOptional() @IsString() dtcSelectedCategory?: string;
  @IsOptional() dtcSelectionReasons?: string[];
  @IsOptional() @IsString() dtcRecommendationNotes?: string;
  @IsOptional() @IsString() dtcReviewedByName?: string;
  @IsOptional() @IsString() dtcReviewSignature?: string;
  @IsOptional() @IsString() dtcRemarks?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DtcAlternativeRemarkDto)
  alternativeRemarks?: DtcAlternativeRemarkDto[];
}

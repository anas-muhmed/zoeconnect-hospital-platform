import { IsString, IsNotEmpty, MaxLength, IsOptional, IsBoolean, IsIn, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLanguageDto {
  @ApiProperty({ example: 'ta', description: "BCP-47-ish code, e.g. 'en', 'ar', 'ta'" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code: string;

  @ApiProperty({ example: 'Tamil' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class UpdateLanguageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TranslationItemDto {
  @ApiProperty({ enum: ['FORM', 'SECTION', 'QUESTION', 'OPTION'] })
  @IsIn(['FORM', 'SECTION', 'QUESTION', 'OPTION'])
  entityType: 'FORM' | 'SECTION' | 'QUESTION' | 'OPTION';

  @ApiProperty()
  @IsUUID()
  entityId: string;

  @ApiProperty({ example: 'questionText' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  fieldName: string;

  /** Empty string is valid -- it clears a previously-saved translation for this field, falling back to the source text. */
  @ApiProperty()
  @IsString()
  value: string;
}

export class UpsertTranslationsDto {
  @ApiProperty({ type: [TranslationItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationItemDto)
  items: TranslationItemDto[];
}

import { IsArray, IsUUID, ValidateNested, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitAnswerDto {
  @ApiProperty()
  @IsUUID()
  questionId: string;

  /**
   * Shape varies by question type (string, number, string[], ...) -- real
   * validation happens against the live question at submit time in the
   * service, not here. `@IsOptional()` isn't semantically about optionality
   * -- it's the only decorator needed to register this property with
   * class-validator's metadata so the global ValidationPipe's
   * `whitelist: true` doesn't silently strip it (and `forbidNonWhitelisted`
   * doesn't then reject the request for an "unknown" property). Without any
   * decorator here, every submission was rejected with a 400 before it ever
   * reached FeedbackPublicService.
   */
  @ApiProperty()
  @IsOptional()
  value: unknown;
}

export class SubmitFeedbackDto {
  @ApiProperty({ type: [SubmitAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  answers: SubmitAnswerDto[];

  @ApiPropertyOptional({ description: 'Per-device token issued by GET /feedback/public/:token, used only for duplicate-submission checks -- never a personal identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  anonymousId?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

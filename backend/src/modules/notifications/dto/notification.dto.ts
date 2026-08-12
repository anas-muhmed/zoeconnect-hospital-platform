import { IsString, IsEnum, IsOptional, IsArray, IsBoolean, IsUUID, MaxLength, ArrayMaxSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { NotificationChannel, NotificationEventType } from '../notification.types';

const CHANNELS: NotificationChannel[]    = ['WHATSAPP', 'SMS', 'EMAIL'];
const EVENT_TYPES: NotificationEventType[] = [
  'WELCOME', 'EARN_POINTS', 'REDEEM_POINTS',
  'BIRTHDAY_BONUS', 'CAMPAIGN_BONUS', 'TIER_UPGRADE',
  'ACCOUNT_EXPIRY_WARNING', 'CUSTOM',
];

export class SendNotificationDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString() @MaxLength(20)
  phone: string;

  @ApiProperty({ enum: CHANNELS })
  @IsEnum(CHANNELS)
  channel: NotificationChannel;

  @ApiProperty({ enum: EVENT_TYPES })
  @IsEnum(EVENT_TYPES)
  eventType: NotificationEventType;

  @ApiProperty({ example: 'hdsp_earn_points' })
  @IsString() @MaxLength(120)
  templateName: string;

  @ApiPropertyOptional({ example: 'en_US' })
  @IsOptional() @IsString() @MaxLength(10)
  languageCode?: string;

  @ApiPropertyOptional({ type: [String], example: ['John', '50', '350'] })
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  templateParams?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  loyaltyAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(40)
  mrn?: string;
}

export class CreateTemplateDto {
  @ApiProperty() @IsString() @MaxLength(120)
  name: string;

  @ApiProperty({ enum: EVENT_TYPES }) @IsEnum(EVENT_TYPES)
  eventType: NotificationEventType;

  @ApiProperty({ enum: CHANNELS }) @IsEnum(CHANNELS)
  channel: NotificationChannel;

  @ApiProperty() @IsString() @MaxLength(120)
  templateName: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10)
  languageCode?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  paramDescriptions?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  bodyPreview?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  templateName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10)
  languageCode?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  paramDescriptions?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  bodyPreview?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

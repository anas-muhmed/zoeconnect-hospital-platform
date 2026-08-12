import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionChangeAction } from '../entities/billing-subscription-change.entity';

const ACTIONS: SubscriptionChangeAction[] = ['ADD', 'REMOVE'];

export class CreateSubscriptionChangeDto {
  @ApiProperty({ example: 'CMS' })
  @IsString()
  moduleCode: string;

  @ApiProperty({ enum: ACTIONS })
  @IsString() @IsIn(ACTIONS)
  action: SubscriptionChangeAction;
}

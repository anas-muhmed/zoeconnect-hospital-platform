import { ApiProperty } from '@nestjs/swagger';
import { BillingSubscriptionChange } from '../entities/billing-subscription-change.entity';

export class SubscriptionChangeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() moduleCode: string;
  @ApiProperty({ nullable: true }) moduleName: string | null;
  @ApiProperty() action: string;
  @ApiProperty() effectiveDate: Date;
  @ApiProperty() status: string;
  @ApiProperty() createdAt: Date;

  static from(change: BillingSubscriptionChange, moduleName?: string): SubscriptionChangeResponseDto {
    const dto = new SubscriptionChangeResponseDto();
    dto.id = change.id;
    dto.moduleCode = change.moduleCode;
    dto.moduleName = moduleName ?? null;
    dto.action = change.action;
    dto.effectiveDate = change.effectiveDate;
    dto.status = change.status;
    dto.createdAt = change.createdAt;
    return dto;
  }
}

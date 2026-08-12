import { ApiProperty } from '@nestjs/swagger';
import { BillingInvoice } from '../entities/billing-invoice.entity';

export class InvoiceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() invoiceNumber: string;
  @ApiProperty() amount: number;
  @ApiProperty() tax: number;
  @ApiProperty() currency: string;
  @ApiProperty() status: string;
  @ApiProperty() issuedAt: Date;

  static from(invoice: BillingInvoice): InvoiceResponseDto {
    const dto = new InvoiceResponseDto();
    dto.id = invoice.id;
    dto.invoiceNumber = invoice.invoiceNumber;
    dto.amount = invoice.amount;
    dto.tax = invoice.tax;
    dto.currency = invoice.currency;
    dto.status = invoice.status;
    dto.issuedAt = invoice.issuedAt;
    return dto;
  }
}

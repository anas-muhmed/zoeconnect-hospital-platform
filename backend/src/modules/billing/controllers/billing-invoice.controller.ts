import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { BillingInvoiceService } from '../services/billing-invoice.service';
import { InvoiceResponseDto } from '../dto/invoice-response.dto';

/**
 * ZoeConnect Billing, Phase 6. Tenant is resolved exclusively from the
 * JWT, same as every other billing controller -- a tenant can only ever
 * see its own invoices.
 */
@ApiTags('Billing')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('billing/invoices')
export class BillingInvoiceController {
  constructor(private readonly invoiceService: BillingInvoiceService) {}

  @Get()
  @ApiOperation({ summary: "List the tenant's invoice history, newest first" })
  async list(@CurrentUser() actor: User): Promise<InvoiceResponseDto[]> {
    const invoices = await this.invoiceService.listForTenant(actor.tenantId);
    return invoices.map((i) => InvoiceResponseDto.from(i));
  }
}

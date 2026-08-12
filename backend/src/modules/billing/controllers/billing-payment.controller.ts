import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { BillingPaymentService } from '../services/billing-payment.service';
import { PaymentResponseDto } from '../dto/payment-response.dto';

/** ZoeConnect Billing, Phase 6. Tenant-scoped payment attempt history for the billing management UI. */
@ApiTags('Billing')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('billing/payments')
export class BillingPaymentController {
  constructor(private readonly paymentService: BillingPaymentService) {}

  @Get()
  @ApiOperation({ summary: "List the tenant's payment attempt history, newest first" })
  async list(@CurrentUser() actor: User): Promise<PaymentResponseDto[]> {
    const payments = await this.paymentService.listForTenant(actor.tenantId);
    return payments.map((p) => PaymentResponseDto.from(p));
  }
}

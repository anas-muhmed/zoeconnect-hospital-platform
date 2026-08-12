import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { BillingQuoteService } from '../services/billing-quote.service';
import { CreateQuoteDto } from '../dto/create-quote.dto';
import { QuoteResponseDto } from '../dto/quote-response.dto';

/**
 * Tenant is resolved exclusively from the authenticated user's JWT
 * (`actor.tenantId`) -- never from a request body/param, so a tenant can
 * never request or read another tenant's quote. See
 * BillingQuoteService.getQuote() for the ownership check on the read
 * side.
 */
@ApiTags('Billing')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('billing')
export class BillingQuoteController {
  constructor(private readonly quoteService: BillingQuoteService) {}

  @Post('quote')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Server-calculate a price quote for a module selection + billing cycle. Frontend must never compute or trust its own price.' })
  async createQuote(@Body() dto: CreateQuoteDto, @CurrentUser() actor: User): Promise<QuoteResponseDto> {
    const quote = await this.quoteService.createQuote(actor.tenantId, actor.id, dto);
    return QuoteResponseDto.from(quote);
  }

  @Get('quote/:id')
  @ApiOperation({ summary: 'Fetch a previously created quote (tenant-scoped)' })
  async getQuote(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User): Promise<QuoteResponseDto> {
    const quote = await this.quoteService.getQuote(id, actor.tenantId);
    return QuoteResponseDto.from(quote);
  }
}

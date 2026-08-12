import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, ParseIntPipe, DefaultValuePipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse,
} from '@nestjs/swagger';
import { EnrollmentService }  from './services/enrollment.service';
import { TransactionService } from './services/transaction.service';
import { RedemptionService }  from './services/redemption.service';
import { PointEngineService } from './services/point-engine.service';
import { CardConfigService }  from './services/card-config.service';
import { EnrollPatientDto }   from './dto/enroll.dto';
import { EarnPointsDto }      from './dto/earn-points.dto';
import { RedeemRewardDto, ProcessRedemptionDto, AdjustPointsDto } from './dto/redeem.dto';
import { UpdateCardCategoryDto } from './dto/card-config.dto';
import { JwtAuthGuard }       from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../common/guards/permissions.guard';
import { LicenseGuard }       from '../licensing/license.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule }      from '../licensing/decorators/require-module.decorator';
import { ActiveBranchId }     from '../../common/decorators/active-branch.decorator';
import { CurrentUser }        from '../../common/decorators/current-user.decorator';
import { Audit }              from '../../common/decorators/audit.decorator';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import type { User }          from '../users/entities/user.entity';

/** Stage B (Checkpoint B3.4) — class-level, matching the pattern used for
 * UsersController/RbacController: this controller is entirely its own
 * module's business, no mixed public/sensitive routes. */
@ApiTags('Loyalty')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('LOYALTY')
@UseInterceptors(TenantContextInterceptor)
@Controller('loyalty')
export class LoyaltyController {
  constructor(
    private readonly enrollmentSvc:  EnrollmentService,
    private readonly transactionSvc: TransactionService,
    private readonly redemptionSvc:  RedemptionService,
    private readonly pointEngine:    PointEngineService,
    private readonly cardConfigSvc:  CardConfigService,
  ) {}

  // ── Enrollment ──────────────────────────────────────────────────────────
  @Post('enroll')
  @RequirePermissions('LOYALTY:ACCOUNTS:CREATE')
  @Audit({ action: 'LOYALTY_ENROLL', module: 'LOYALTY', entityType: 'loyalty_account' })
  @ApiOperation({ summary: 'Enroll a patient in the loyalty program' })
  @ApiResponse({ status: 409, description: 'Patient already enrolled' })
  enroll(@Body() dto: EnrollPatientDto, @CurrentUser() actor: User) {
    return this.enrollmentSvc.enroll(dto, actor.id);
  }

  // ── Card category configuration ──────────────────────────────────────────
  @Get('card-config')
  @RequirePermissions('LOYALTY:CARD_CONFIG:READ')
  @ApiOperation({ summary: 'List all card tier configurations (earn rates, point values, discounts)' })
  getCardConfig() {
    return this.cardConfigSvc.findAll();
  }

  @Patch('card-config/:id')
  @RequirePermissions('LOYALTY:CARD_CONFIG:UPDATE')
  @Audit({ action: 'CARD_CONFIG_UPDATED', module: 'LOYALTY', entityType: 'card_category' })
  @ApiOperation({ summary: 'Update a card tier configuration' })
  updateCardConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCardCategoryDto,
    @CurrentUser() actor: User,
  ) {
    return this.cardConfigSvc.update(id, dto, actor.id);
  }

  @Post('card-config/recalculate-tiers')
  @RequirePermissions('LOYALTY:CARD_CONFIG:UPDATE')
  @ApiOperation({ summary: 'Bulk-reassign all accounts to correct tier based on current minSpend thresholds' })
  recalculateTiers() {
    return this.cardConfigSvc.recalculateTiers();
  }

  // ── Account list (paginated, searchable) ────────────────────────────────
  @Get('accounts')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'List all loyalty accounts with optional search and status filter' })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Filter by MRN, card number, or patient name' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'ACTIVE | SUSPENDED | CLOSED' })
  @ApiQuery({ name: 'tier',   required: false, type: String, description: 'SILVER | GOLD | PLATINUM' })
  listAccounts(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('tier')   tier?: string,
    @ActiveBranchId() branchId?: string,
  ) {
    return this.enrollmentSvc.listAccounts(page, Math.min(limit, 100), search, status, tier, branchId);
  }

  // ── Account lookup ──────────────────────────────────────────────────────
  @Get('accounts/mrn/:mrn')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'Get loyalty account by patient MRN' })
  getByMrn(@Param('mrn') mrn: string) {
    return this.enrollmentSvc.getAccountByMrn(mrn);
  }

  @Get('accounts/card/:cardNumber')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'Get loyalty account by card number' })
  getByCard(@Param('cardNumber') cardNumber: string) {
    return this.enrollmentSvc.getAccountByCard(cardNumber);
  }

  @Get('accounts/:id')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'Get loyalty account by ID' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentSvc.getAccountById(id);
  }

  // ── Discount preview ─────────────────────────────────────────────────────
  @Get('accounts/:id/discount')
  @RequirePermissions('LOYALTY:ACCOUNTS:READ')
  @ApiOperation({ summary: 'Get current applicable discount for an account' })
  async getDiscount(@Param('id', ParseUUIDPipe) id: string) {
    const account = await this.enrollmentSvc.getAccountById(id);
    const result  = this.pointEngine.computeDiscount(account.availablePoints, account.category);
    return {
      accountId:       account.id,
      cardNumber:      account.cardNumber,
      tier:            account.category.name,
      availablePoints: account.availablePoints,
      ...result,
    };
  }

  // ── Transactions ─────────────────────────────────────────────────────────
  @Get('accounts/:id/transactions')
  @RequirePermissions('LOYALTY:TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Get transaction history for an account' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.transactionSvc.getTransactions(id, page, Math.min(limit, 100));
  }

  // ── Earn points ──────────────────────────────────────────────────────────
  @Post('earn')
  @RequirePermissions('LOYALTY:TRANSACTIONS:CREATE')
  @Audit({ action: 'LOYALTY_EARN', module: 'LOYALTY' })
  @ApiOperation({ summary: 'Earn points from a HIS bill' })
  @ApiResponse({ status: 409, description: 'Bill already processed for this account' })
  earnPoints(@Body() dto: EarnPointsDto, @CurrentUser() actor: User) {
    return this.transactionSvc.earnFromBill(dto, actor.id);
  }

  // ── Adjust points (admin) ─────────────────────────────────────────────────
  @Post('adjust')
  @RequirePermissions('LOYALTY:TRANSACTIONS:CREATE')
  @Audit({ action: 'LOYALTY_ADJUST', module: 'LOYALTY' })
  @ApiOperation({ summary: 'Manually adjust account points (add or subtract)' })
  adjustPoints(@Body() dto: AdjustPointsDto, @CurrentUser() actor: User) {
    return this.transactionSvc.adjustPoints(dto, actor.id);
  }

  // ── Reward catalog ────────────────────────────────────────────────────────
  @Get('rewards')
  @RequirePermissions('LOYALTY:REDEMPTIONS:CREATE')
  @ApiOperation({ summary: 'Get active reward catalog' })
  getCatalog() {
    return this.redemptionSvc.getCatalog();
  }

  // ── Redemptions ───────────────────────────────────────────────────────────
  @Get('accounts/:id/redemptions')
  @RequirePermissions('LOYALTY:REDEMPTIONS:CREATE')
  @ApiOperation({ summary: 'Get redemption history for an account' })
  getRedemptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.redemptionSvc.getRedemptions(id, page, Math.min(limit, 100));
  }

  @Post('redeem')
  @RequirePermissions('LOYALTY:REDEMPTIONS:CREATE')
  @Audit({ action: 'LOYALTY_REDEMPTION_REQUEST', module: 'LOYALTY' })
  @ApiOperation({ summary: 'Create a reward redemption request (deducts points immediately)' })
  @ApiResponse({ status: 400, description: 'Insufficient points or inactive account' })
  redeem(@Body() dto: RedeemRewardDto, @CurrentUser() actor: User) {
    return this.redemptionSvc.createRedemption(dto, actor.id);
  }

  @Patch('redemptions/:id')
  @RequirePermissions('LOYALTY:REDEMPTIONS:APPROVE')
  @Audit({ action: 'LOYALTY_REDEMPTION_PROCESS', module: 'LOYALTY', entityType: 'reward_redemption' })
  @ApiOperation({ summary: 'Approve / Reject / Fulfill a redemption' })
  processRedemption(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProcessRedemptionDto,
    @CurrentUser() actor: User,
  ) {
    return this.redemptionSvc.processRedemption(id, dto, actor.id);
  }
}

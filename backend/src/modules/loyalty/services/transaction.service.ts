import {
  Inject, Injectable, BadRequestException, ConflictException, Logger, Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { LoyaltyTransaction } from '../entities/loyalty-transaction.entity';
import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { CardCategory } from '../entities/card-category.entity';
import { Campaign } from '../entities/campaign.entity';
import { EnrollmentService } from './enrollment.service';
import { PointEngineService } from './point-engine.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notifications/notification.service';
import { HisLoyaltyBridgeService } from '../../his/billing/his-loyalty-bridge.service';
import { OracleDepositLogBridgeService } from '../../his/billing/oracle-deposit-log-bridge.service';
import type { EarnPointsDto } from '../dto/earn-points.dto';
import type { AdjustPointsDto } from '../dto/redeem.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(LoyaltyTransaction) private readonly txRepo: Repository<LoyaltyTransaction>,
    @InjectRepository(LoyaltyAccount)     private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(CardCategory)        private readonly categoryRepo: Repository<CardCategory>,
    private readonly enrollmentSvc: EnrollmentService,
    private readonly pointEngine: PointEngineService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    @Optional() private readonly notificationService: NotificationService | null,
    @Optional() @Inject(HisLoyaltyBridgeService) private readonly hisBridge: HisLoyaltyBridgeService | null,
    @Optional() @Inject(OracleDepositLogBridgeService) private readonly depositBridge: OracleDepositLogBridgeService | null,
    /**
     * Stage B (Checkpoint B3.4) — scoped repository for `getTransactions()`
     * only. `findEarnByBillId()`, `reverseFromBill()`, `adjustFromBill()`
     * and every write path stay on `txRepo` above — those are reached from
     * HIS sync (controller + cron) and the earn-from-bill BullMQ processor.
     */
    @Inject(getTenantScopedRepositoryToken(LoyaltyTransaction))
    private readonly scopedTxRepo: TenantScopedRepository<LoyaltyTransaction>,
    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log(): resolve the ambient tenant
    // (or null if none) at each queryRunner.manager.create() call site.
    // These sites are transaction-scoped and have no injected repo of
    // their own, but still resolve tenantId the same way.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // ── Get transaction history ───────────────────────────────────────────────
  // A5.5 API Contract Audit: explicit column list excludes tenant_id so
  // GET /loyalty/accounts/:id/transactions doesn't leak it.
  async getTransactions(
    accountId: string,
    page = 1,
    limit = 20,
  ) {
    const [items, total] = await this.scopedTxRepo.findAndCount({
      where: { accountId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      select: [
        'id', 'accountId', 'transactionType', 'referenceType', 'referenceId',
        'billAmount', 'pointsDelta', 'cardValueDelta', 'discountApplied',
        'discountPercentage', 'balanceBefore', 'balanceAfter', 'campaignId',
        'createdBy', 'notes', 'createdAt',
      ],
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Earn points from a bill ───────────────────────────────────────────────
  async earnFromBill(dto: EarnPointsDto, processedBy: string | null) {
    const account = await this.enrollmentSvc.resolveAccount(dto.identifier);

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Loyalty account is inactive');
    }

    // Calculate points
    const calc = dto.overridePoints !== undefined
      ? {
          basePoints: dto.overridePoints,
          campaignBonus: 0,
          campaignMultiplier: 1,
          totalPoints: dto.overridePoints,
          activeCampaigns: [],
        }
      : await this.pointEngine.calculateEarnPoints(dto.billAmount, account.category);

    const pointsToAdd = calc.totalPoints;
    // IMPORTANT: TypeORM returns PostgreSQL `numeric` columns as strings at runtime
    // (node-postgres preserves precision). Explicitly coerce to Number to avoid
    // string concatenation bugs (e.g. "0" + 100 = "0100" instead of 100).
    const balanceBefore = Number(account.availablePoints);
    const balanceAfter  = balanceBefore + pointsToAdd;

    // New total spend after this bill
    const newTotalSpend = Number(account.totalLifetimeSpend) + Number(dto.billAmount);

    // Run in a transaction — partial unique index on (account_id, reference_id) WHERE type='EARN' enforces idempotency
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tenantId = await this.tenantContext.currentTenantIdOrNull();

      // 1. Insert transaction (DB constraint catches duplicate bill)
      const tx = queryRunner.manager.create(LoyaltyTransaction, {
        accountId:       account.id,
        transactionType: 'EARN',
        referenceType:   'BILL',
        referenceId:     dto.billId,
        pointsDelta:     pointsToAdd,
        billAmount:      dto.billAmount,
        balanceBefore,
        balanceAfter,
        notes:           dto.description ?? `Earned from bill ${dto.billId}`,
        createdBy:       processedBy ?? undefined,  // null = HIS auto-sync
        tenantId,
      });
      await queryRunner.manager.save(tx);

      // 2. Determine if tier should upgrade
      const allCategories = await this.categoryRepo.find({
        where: { isActive: true },
        order: { minSpend: 'ASC' },
      });
      const newCategory = this.pointEngine.determineTier(newTotalSpend, allCategories);
      const tierChanged = newCategory.id !== account.cardCategoryId;

      // 3. Update account balances
      await queryRunner.manager.update(LoyaltyAccount, account.id, {
        availablePoints:    balanceAfter,
        totalPointsEarned:  Number(account.totalPointsEarned) + pointsToAdd,
        totalLifetimeSpend: newTotalSpend,
        cardCategoryId:     newCategory.id,
      });

      await queryRunner.commitTransaction();

      await this.auditService.log({
        action: 'LOYALTY_EARN',
        module: 'LOYALTY',
        userId: processedBy ?? undefined,  // null = HIS auto-sync
        entityType: 'loyalty_account',
        entityId: account.id,
        newValue: {
          billId: dto.billId,
          billAmount: dto.billAmount,
          points: pointsToAdd,
          balanceAfter,
          tierChanged,
          newTier: newCategory.name,
        },
      });

      const result = {
        accountId:         account.id,
        cardNumber:        account.cardNumber,
        pointsEarned:      pointsToAdd,
        balanceBefore,
        balanceAfter,
        tierChanged,
        newTier:           newCategory.name,
        activeCampaigns:   calc.activeCampaigns,
      };

      // Best-effort Oracle sync — fire-and-forget, never blocks the response.
      // Both pushes happen ONLY here, after commitTransaction() above has
      // already succeeded — Oracle must never be updated ahead of a
      // successful Postgres commit.
      let discountResultForDeposit: ReturnType<PointEngineService['computeDiscount']> | null = null;
      if (this.hisBridge) {
        const discountResult = this.pointEngine.computeDiscount(balanceAfter, newCategory);
        discountResultForDeposit = discountResult;
        this.hisBridge.upsertLoyaltySummary({
          patientMrn:          account.patientMrn,
          patientName:         account.patientName,
          cardNumber:          account.cardNumber,
          tierCode:            newCategory.code,
          tierName:            newCategory.name,
          loyaltyStatus:       account.status,
          totalLifetimeSpend:  newTotalSpend,
          totalPointsEarned:   Number(account.totalPointsEarned) + pointsToAdd,
          totalPointsRedeemed: Number(account.totalPointsRedeemed),
          availablePoints:     balanceAfter,
          redeemableAmount:    discountResult.cardValue,
          discountPct:         discountResult.discountPct,
          lastBillId:          dto.billId,
          lastBillAmount:      dto.billAmount,
          lastBillDate:        new Date(),
          lastTxnType:         'EARN',
        }).catch(() => { /* already logged inside bridge */ });
      }

      // Sync the latest redeemable balance onto Oracle's active DEPOSIT_LOG
      // Block row (DEPOSIT_TYPE=13). Oracle HIS owns the row lifecycle;
      // ZoeConnect only ever updates the amount — see OracleDepositLogBridgeService.
      if (this.depositBridge) {
        const discountResult = discountResultForDeposit ?? this.pointEngine.computeDiscount(balanceAfter, newCategory);
        this.depositBridge
          .syncActiveBlockAmount(account.patientMrn, discountResult.cardValue)
          .catch(() => { /* already logged inside bridge */ });
      }

      // Best-effort earn notification
      if (this.notificationService && account.phone) {
        this.notificationService.send({
          phone:            account.phone,
          channel:          'WHATSAPP',
          eventType:        tierChanged ? 'TIER_UPGRADE' : 'EARN_POINTS',
          templateName:     tierChanged ? 'hdsp_tier_upgrade' : 'hdsp_earn_points',
          languageCode:     'en_US',
          templateParams:   tierChanged
            ? [account.patientMrn, newCategory.name, account.category?.name ?? 'Silver']
            : [account.patientMrn, String(pointsToAdd), String(balanceAfter), dto.billId],
          loyaltyAccountId: account.id,
          mrn:              account.patientMrn,
          metadata:         { billId: dto.billId, billAmount: dto.billAmount },
        }).catch(err =>
          this.logger.warn(`Earn notification failed (non-critical): ${(err as Error).message}`),
        );
      }

      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();

      // Unique constraint violation = duplicate bill
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException(`Bill ${dto.billId} has already been processed for this account`);
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Campaign bonus (birthday / festival flat bonus) ───────────────────────
  async postCampaignBonus(
    accountId: string,
    points: number,
    campaignId: string,
    campaignName: string,
    processedBy = 'SYSTEM',
  ): Promise<void> {
    const account = await this.enrollmentSvc.getAccountById(accountId);
    const balanceBefore = Number(account.availablePoints);
    const balanceAfter  = balanceBefore + points;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      const tx = queryRunner.manager.create(LoyaltyTransaction, {
        accountId,
        transactionType: 'EARN',
        referenceType:   'CAMPAIGN',
        referenceId:     campaignId,
        pointsDelta:     points,
        billAmount:      null,
        balanceBefore,
        balanceAfter,
        notes:           `Campaign bonus: ${campaignName}`,
        createdBy:       processedBy === 'SYSTEM' ? null : processedBy,
        campaignId,
        tenantId,
      });
      await queryRunner.manager.save(tx);
      await queryRunner.manager.update(LoyaltyAccount, accountId, {
        availablePoints:   balanceAfter,
        totalPointsEarned: Number(account.totalPointsEarned) + points,
      });
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.auditService.log({
      action: 'LOYALTY_CAMPAIGN_BONUS',
      module: 'LOYALTY',
      entityType: 'loyalty_account',
      entityId: accountId,
      newValue: { campaignId, campaignName, points, balanceAfter },
    });
  }

  // ── Manual point adjustment ───────────────────────────────────────────────
  async adjustPoints(dto: AdjustPointsDto, processedBy: string) {
    const account = await this.enrollmentSvc.getAccountById(dto.accountId);

    const newBalance = Number(account.availablePoints) + dto.points;
    if (newBalance < 0) {
      throw new BadRequestException(
        `Adjustment of ${dto.points} would result in negative balance (current: ${account.availablePoints})`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      const tx = queryRunner.manager.create(LoyaltyTransaction, {
        accountId:       account.id,
        transactionType: 'ADJUST',
        referenceType:   'MANUAL',
        referenceId:     'MANUAL',
        pointsDelta:     dto.points,
        billAmount:      null,
        balanceBefore:   account.availablePoints,
        balanceAfter:    newBalance,
        notes:           dto.reason,
        createdBy:       processedBy,
        tenantId,
      });
      await queryRunner.manager.save(tx);
      await queryRunner.manager.update(LoyaltyAccount, account.id, {
        availablePoints:   newBalance,
        totalPointsEarned: dto.points > 0 ? Number(account.totalPointsEarned) + dto.points : Number(account.totalPointsEarned),
      });
      await queryRunner.commitTransaction();

      await this.auditService.log({
        action: 'LOYALTY_ADJUST',
        module: 'LOYALTY',
        userId: processedBy,
        entityType: 'loyalty_account',
        entityId: account.id,
        newValue: { adjustment: dto.points, reason: dto.reason, balanceAfter: newBalance },
      });

      return { accountId: account.id, adjustment: dto.points, newBalance };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Find existing EARN transaction for a bill (used by HIS sync) ──────────
  async findEarnByBillId(billId: string): Promise<LoyaltyTransaction | null> {
    return this.txRepo.findOne({
      where: { referenceId: billId, transactionType: 'EARN', referenceType: 'BILL' },
    });
  }

  // ── Reverse points for a cancelled bill (HIS sync) ───────────────────────
  //
  //  Called when HIS marks a previously-FINALISED bill as CANCELLED/REVERSED.
  //  Creates a REVERSE transaction that negates the original points.
  //  Idempotent — returns null if no EARN exists or already reversed.
  async reverseFromBill(
    billId: string,
    mrn: string,
    processedBy: string | null,
  ): Promise<{ pointsReversed: number; balanceAfter: number } | null> {
    const earnTx = await this.txRepo.findOne({
      where: { referenceId: billId, transactionType: 'EARN', referenceType: 'BILL' },
    });
    if (!earnTx) return null;

    const existing = await this.txRepo.findOne({
      where: { referenceId: billId, transactionType: 'REVERSE', referenceType: 'BILL' },
    });
    if (existing) return null;

    const account = await this.enrollmentSvc.getAccountByMrn(mrn);
    if (!account) return null;

    const pointsToReverse = Number(earnTx.pointsDelta);
    const balanceBefore   = Number(account.availablePoints);
    const balanceAfter    = Math.max(0, balanceBefore - pointsToReverse);
    const actualReversed  = balanceBefore - balanceAfter;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      await queryRunner.manager.save(
        queryRunner.manager.create(LoyaltyTransaction, {
          accountId:       account.id,
          transactionType: 'REVERSE',
          referenceType:   'BILL',
          referenceId:     billId,
          pointsDelta:     -actualReversed,
          billAmount:      earnTx.billAmount,
          balanceBefore,
          balanceAfter,
          notes:           `Bill ${billId} cancelled in HIS — points reversed`,
          createdBy:       processedBy ?? undefined,
          tenantId,
        }),
      );
      await queryRunner.manager.update(LoyaltyAccount, account.id, {
        availablePoints:    balanceAfter,
        totalPointsEarned:  Math.max(0, Number(account.totalPointsEarned) - actualReversed),
        totalLifetimeSpend: Math.max(0, Number(account.totalLifetimeSpend) - Number(earnTx.billAmount ?? 0)),
      });
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.auditService.log({
      action: 'LOYALTY_REVERSE',
      module: 'LOYALTY',
      userId: processedBy ?? undefined,
      entityType: 'loyalty_account',
      entityId: account.id,
      newValue: { billId, pointsReversed: actualReversed, balanceAfter, reason: 'HIS bill cancelled' },
    });

    this.pushAccountToOracle(account, balanceAfter, billId, Number(earnTx.billAmount ?? 0), 'REVERSE');

    this.logger.log(
      `REVERSE bill ${billId}: ${actualReversed} pts for MRN ${mrn} (${balanceBefore} -> ${balanceAfter})`,
    );
    return { pointsReversed: actualReversed, balanceAfter };
  }

  // ── Adjust points when an already-settled bill is amended (HIS sync) ─────
  //
  //  Called when a FINALISED bill is edited in HIS with a new total amount.
  //  Posts an ADJUST transaction for the point delta. Idempotent if amount unchanged.
  async adjustFromBill(
    billId: string,
    mrn: string,
    newBillAmount: number,
    processedBy: string | null,
  ): Promise<{ pointsDelta: number; balanceAfter: number } | null> {
    const earnTx = await this.txRepo.findOne({
      where: { referenceId: billId, transactionType: 'EARN', referenceType: 'BILL' },
    });
    if (!earnTx) return null;

    const oldBillAmount = Number(earnTx.billAmount ?? 0);
    if (Math.abs(newBillAmount - oldBillAmount) < 1) return null;

    const account = await this.enrollmentSvc.getAccountByMrn(mrn);
    if (!account) return null;

    const allCategories = await this.categoryRepo.find({ where: { isActive: true }, order: { minSpend: 'ASC' } });
    const oldPoints = Number(earnTx.pointsDelta);
    const newCalc   = await this.pointEngine.calculateEarnPoints(newBillAmount, account.category);
    const newPoints = newCalc.totalPoints;
    const delta     = newPoints - oldPoints;
    if (delta === 0) return null;

    const balanceBefore = Number(account.availablePoints);
    const balanceAfter  = Math.max(0, balanceBefore + delta);
    const amountDelta   = newBillAmount - oldBillAmount;
    const newTotalSpend = Math.max(0, Number(account.totalLifetimeSpend) + amountDelta);
    const newCategory   = this.pointEngine.determineTier(newTotalSpend, allCategories);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      await queryRunner.manager.save(
        queryRunner.manager.create(LoyaltyTransaction, {
          accountId:       account.id,
          transactionType: 'ADJUST',
          referenceType:   'BILL',
          referenceId:     `${billId}:ADJ`,
          pointsDelta:     delta,
          billAmount:      newBillAmount,
          balanceBefore,
          balanceAfter,
          notes:           `Bill ${billId} amended: Rs.${oldBillAmount} -> Rs.${newBillAmount} (${delta > 0 ? '+' : ''}${delta} pts)`,
          createdBy:       processedBy ?? undefined,
          tenantId,
        }),
      );
      await queryRunner.manager.update(LoyaltyTransaction, earnTx.id, {
        billAmount:  newBillAmount,
        pointsDelta: newPoints,
      });
      await queryRunner.manager.update(LoyaltyAccount, account.id, {
        availablePoints:    balanceAfter,
        totalPointsEarned:  Math.max(0, Number(account.totalPointsEarned) + (delta > 0 ? delta : 0)),
        totalLifetimeSpend: newTotalSpend,
        cardCategoryId:     newCategory.id,
      });
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.auditService.log({
      action: 'LOYALTY_ADJUST',
      module: 'LOYALTY',
      userId: processedBy ?? undefined,
      entityType: 'loyalty_account',
      entityId: account.id,
      newValue: { billId, oldAmount: oldBillAmount, newAmount: newBillAmount, pointsDelta: delta, balanceAfter },
    });

    this.pushAccountToOracle(account, balanceAfter, billId, newBillAmount, 'ADJUST');

    this.logger.log(
      `ADJUST bill ${billId}: ${delta > 0 ? '+' : ''}${delta} pts for MRN ${mrn} (${balanceBefore} -> ${balanceAfter})`,
    );
    return { pointsDelta: delta, balanceAfter };
  }

  // ── Internal Oracle push helper ───────────────────────────────────────────
  // Called only after the caller's Postgres transaction has already
  // committed (reverseFromBill / adjustFromBill both call this post-commit).
  private pushAccountToOracle(
    account: LoyaltyAccount,
    currentBalance: number,
    lastBillId: string,
    lastBillAmount: number,
    txnType: 'EARN' | 'REDEEM' | 'ADJUST' | 'REVERSE',
  ): void {
    if (!account.category) return;
    const discountResult = this.pointEngine.computeDiscount(currentBalance, account.category);

    if (this.hisBridge) {
      this.hisBridge.upsertLoyaltySummary({
        patientMrn:          account.patientMrn,
        patientName:         account.patientName,
        cardNumber:          account.cardNumber,
        tierCode:            account.category.code,
        tierName:            account.category.name,
        loyaltyStatus:       account.status,
        totalLifetimeSpend:  Number(account.totalLifetimeSpend),
        totalPointsEarned:   Number(account.totalPointsEarned),
        totalPointsRedeemed: Number(account.totalPointsRedeemed),
        availablePoints:     currentBalance,
        redeemableAmount:    discountResult.cardValue,
        discountPct:         discountResult.discountPct,
        lastBillId,
        lastBillAmount,
        lastBillDate:        new Date(),
        lastTxnType:         txnType,
      }).catch(() => { /* logged inside bridge */ });
    }

    // Sync the latest redeemable balance onto Oracle's active DEPOSIT_LOG
    // Block row. Oracle HIS owns the row lifecycle — ZoeConnect only updates the amount.
    if (this.depositBridge) {
      this.depositBridge
        .syncActiveBlockAmount(account.patientMrn, discountResult.cardValue)
        .catch(() => { /* logged inside bridge */ });
    }
  }
}

import {
  Injectable, BadRequestException, NotFoundException, Optional, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RewardRedemption } from '../entities/reward-redemption.entity';
import { RewardCatalog } from '../entities/reward-catalog.entity';
import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { LoyaltyTransaction } from '../entities/loyalty-transaction.entity';
import { EnrollmentService } from './enrollment.service';
import { PointEngineService } from './point-engine.service';
import { AuditService } from '../../audit/audit.service';
import { HisLoyaltyBridgeService } from '../../his/billing/his-loyalty-bridge.service';
import { OracleDepositLogBridgeService } from '../../his/billing/oracle-deposit-log-bridge.service';
import type { RedeemRewardDto, ProcessRedemptionDto } from '../dto/redeem.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class RedemptionService {
  constructor(
    @InjectRepository(RewardRedemption) private readonly redemptionRepo: Repository<RewardRedemption>,
    @InjectRepository(RewardCatalog)    private readonly rewardRepo: Repository<RewardCatalog>,
    @InjectRepository(LoyaltyAccount)   private readonly accountRepo: Repository<LoyaltyAccount>,
    private readonly enrollmentSvc: EnrollmentService,
    private readonly pointEngine: PointEngineService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    @Optional() @Inject(HisLoyaltyBridgeService) private readonly hisBridge: HisLoyaltyBridgeService | null,
    @Optional() @Inject(OracleDepositLogBridgeService) private readonly depositBridge: OracleDepositLogBridgeService | null,
    /**
     * Stage B (Checkpoint B3.4) — scoped repositories for `getCatalog()`
     * and `getRedemptions()` only. `createRedemption()`/`processRedemption()`
     * and every write path keep using `rewardRepo`/`redemptionRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(RewardCatalog))
    private readonly scopedRewardRepo: TenantScopedRepository<RewardCatalog>,
    @Inject(getTenantScopedRepositoryToken(RewardRedemption))
    private readonly scopedRedemptionRepo: TenantScopedRepository<RewardRedemption>,
    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log(): resolve the ambient tenant
    // (or null if none) at each .create() call site.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // ── List active rewards ───────────────────────────────────────────────────
  // A5.5 API Contract Audit: explicit column list excludes tenant_id so
  // GET /loyalty/rewards doesn't leak it.
  getCatalog(): Promise<RewardCatalog[]> {
    return this.scopedRewardRepo.find({
      where: { isActive: true },
      order: { pointsRequired: 'ASC' },
      select: [
        'id', 'name', 'description', 'pointsRequired', 'rewardType',
        'value', 'isActive', 'stockQty', 'createdAt', 'updatedAt',
      ],
    });
  }

  // ── Redemption history for an account ────────────────────────────────────
  async getRedemptions(accountId: string, page = 1, limit = 20) {
    const [items, total] = await this.scopedRedemptionRepo.findAndCount({
      where: { accountId },
      relations: ['reward'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    // A5.5 API Contract Audit: backs GET /loyalty/accounts/:id/redemptions.
    // The eager `reward` relation (also carrying its own tenantId) makes an
    // explicit .select() impractical, so strip tenantId post-fetch on both
    // the redemption and its joined reward instead.
    for (const item of items) {
      delete (item as { tenantId?: string | null }).tenantId;
      if (item.reward) delete (item.reward as { tenantId?: string | null }).tenantId;
    }
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Create redemption request ─────────────────────────────────────────────
  async createRedemption(dto: RedeemRewardDto, userId: string): Promise<RewardRedemption> {
    const account = await this.enrollmentSvc.getAccountById(dto.accountId);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Loyalty account is inactive');

    const reward = await this.rewardRepo.findOne({ where: { id: dto.rewardId, isActive: true } });
    if (!reward) throw new NotFoundException(`Reward ${dto.rewardId} not found or inactive`);

    if (account.availablePoints < reward.pointsRequired) {
      throw new BadRequestException(
        `Insufficient points. Required: ${reward.pointsRequired}, Available: ${account.availablePoints}`,
      );
    }

    // Check stock
    if (reward.stockQty !== null && reward.stockQty <= 0) {
      throw new BadRequestException(`Reward "${reward.name}" is out of stock`);
    }

    // Deduct points immediately and hold pending approval
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const balanceBefore = account.availablePoints;
      const balanceAfter  = balanceBefore - reward.pointsRequired;
      const tenantId = await this.tenantContext.currentTenantIdOrNull();

      // Deduct points
      const tx = queryRunner.manager.create(LoyaltyTransaction, {
        accountId:       account.id,
        transactionType: 'REDEEM',
        referenceType:   'MANUAL',
        referenceId:     dto.rewardId,
        pointsDelta:     -reward.pointsRequired,
        billAmount:      null,
        balanceBefore,
        balanceAfter,
        notes:           `Redemption: ${reward.name}`,
        createdBy:       userId,
        tenantId,
      });
      await queryRunner.manager.save(tx);
      await queryRunner.manager.update(LoyaltyAccount, account.id, {
        availablePoints: balanceAfter,
      });

      // Decrement stock
      if (reward.stockQty !== null) {
        await queryRunner.manager.update(RewardCatalog, reward.id, {
          stockQty: reward.stockQty - 1,
        });
      }

      // Create redemption record
      const redemption = queryRunner.manager.create(RewardRedemption, {
        accountId:  account.id,
        rewardId:   reward.id,
        pointsUsed: reward.pointsRequired,
        status:     'PENDING',
        notes:      dto.notes ?? null,
        processedBy: null,
        tenantId,
      });
      const saved = await queryRunner.manager.save(redemption);

      // Link transaction to redemption
      await queryRunner.manager.update(LoyaltyTransaction, tx.id, {
        referenceId: saved.id,
      });

      await queryRunner.commitTransaction();

      await this.auditService.log({
        action: 'LOYALTY_REDEMPTION_CREATED',
        module: 'LOYALTY',
        userId,
        entityType: 'reward_redemption',
        entityId: saved.id,
        newValue: { rewardName: reward.name, pointsUsed: reward.pointsRequired, balanceAfter },
      });

      // Best-effort Oracle sync — fire-and-forget. Both pushes happen ONLY
      // here, after commitTransaction() above has already succeeded.
      if (this.hisBridge) {
        const discountResult = this.pointEngine.computeDiscount(balanceAfter, account.category);
        this.hisBridge.upsertLoyaltySummary({
          patientMrn:          account.patientMrn,
          patientName:         account.patientName,
          cardNumber:          account.cardNumber,
          tierCode:            account.category?.code ?? 'SILVER',
          tierName:            account.category?.name ?? 'Silver',
          loyaltyStatus:       account.status,
          totalLifetimeSpend:  Number(account.totalLifetimeSpend),
          totalPointsEarned:   Number(account.totalPointsEarned),
          totalPointsRedeemed: Number(account.totalPointsRedeemed) + reward.pointsRequired,
          availablePoints:     balanceAfter,
          redeemableAmount:    discountResult.cardValue,
          discountPct:         discountResult.discountPct,
          lastBillId:          null,
          lastBillAmount:      null,
          lastBillDate:        null,
          lastTxnType:         'REDEEM',
        }).catch(() => { /* already logged inside bridge */ });
      }

      // Sync the latest redeemable balance onto Oracle's active DEPOSIT_LOG
      // Block row. Oracle HIS owns the row lifecycle — ZoeConnect only updates the amount.
      if (this.depositBridge && account.category) {
        const discountResult = this.pointEngine.computeDiscount(balanceAfter, account.category);
        this.depositBridge
          .syncActiveBlockAmount(account.patientMrn, discountResult.cardValue)
          .catch(() => { /* already logged inside bridge */ });
      }

      return this.redemptionRepo.findOne({
        where: { id: saved.id },
        relations: ['reward'],
      }) as Promise<RewardRedemption>;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Approve / Reject / Fulfill a redemption ───────────────────────────────
  async processRedemption(
    id: string,
    dto: ProcessRedemptionDto,
    processedBy: string,
  ): Promise<RewardRedemption> {
    const redemption = await this.redemptionRepo.findOne({
      where: { id },
      relations: ['account', 'reward'],
    });
    if (!redemption) throw new NotFoundException(`Redemption ${id} not found`);
    if (redemption.status !== 'PENDING') {
      throw new BadRequestException(`Redemption is already ${redemption.status}`);
    }

    // If rejected → refund points
    if (dto.status === 'REJECTED') {
      const account = redemption.account;
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const refundBalance = account.availablePoints + redemption.pointsUsed;
        const tenantId = await this.tenantContext.currentTenantIdOrNull();
        const refundTx = queryRunner.manager.create(LoyaltyTransaction, {
          accountId:       account.id,
          transactionType: 'REVERSE',
          referenceType:   'MANUAL',
          referenceId:     redemption.id,
          pointsDelta:     redemption.pointsUsed,
          billAmount:      null,
          balanceBefore:   account.availablePoints,
          balanceAfter:    refundBalance,
          notes:           `Refund: rejected redemption ${id}`,
          createdBy:       processedBy,
          tenantId,
        });
        await queryRunner.manager.save(refundTx);
        await queryRunner.manager.update(LoyaltyAccount, account.id, {
          availablePoints: refundBalance,
        });
        // Restore stock
        if (redemption.reward.stockQty !== null) {
          await queryRunner.manager.update(RewardCatalog, redemption.rewardId, {
            stockQty: redemption.reward.stockQty + 1,
          });
        }
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }
    }

    await this.redemptionRepo.update(id, {
      status: dto.status,
      processedBy,
      notes: dto.notes ?? redemption.notes,
    });

    await this.auditService.log({
      action: `LOYALTY_REDEMPTION_${dto.status}`,
      module: 'LOYALTY',
      userId: processedBy,
      entityType: 'reward_redemption',
      entityId: id,
      newValue: { status: dto.status, notes: dto.notes },
    });

    return this.redemptionRepo.findOne({
      where: { id },
      relations: ['reward'],
    }) as Promise<RewardRedemption>;
  }
}

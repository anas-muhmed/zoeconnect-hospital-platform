import {
  Injectable, ConflictException, NotFoundException, Optional, Logger, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { branchFilter } from '../../branch/branch.service';
import { CardCategory } from '../entities/card-category.entity';
import { AuditService } from '../../audit/audit.service';
import { PatientService } from '../../his/patient/patient.service';
import { NotificationService } from '../../notifications/notification.service';
import { HisLoyaltyBridgeService } from '../../his/billing/his-loyalty-bridge.service';
import { PointEngineService } from './point-engine.service';
import type { EnrollPatientDto } from '../dto/enroll.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    @InjectRepository(LoyaltyAccount) private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(CardCategory)   private readonly categoryRepo: Repository<CardCategory>,
    private readonly auditService: AuditService,
    private readonly patientService: PatientService,
    private readonly pointEngine: PointEngineService,
    @Optional() private readonly notificationService: NotificationService | null,
    @Optional() @Inject(HisLoyaltyBridgeService) private readonly hisBridge: HisLoyaltyBridgeService | null,
    /**
     * Stage B (Checkpoint B3.4) — scoped repository for `listAccounts()`
     * only. `getAccountById()`/`getAccountByMrn()`/`getAccountByCard()`
     * stay on `accountRepo` above — each is also reached from write
     * infrastructure (birthday-campaign cron, HIS sync, earn-from-bill
     * BullMQ processor) with no request-scoped tenant context, per the B3
     * Eligibility Rule. Every write path also stays on `accountRepo`.
     */
    @Inject(getTenantScopedRepositoryToken(LoyaltyAccount))
    private readonly scopedAccountRepo: TenantScopedRepository<LoyaltyAccount>,
    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log(): resolve the ambient tenant
    // (or null if none) at each .create() call site.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async enroll(dto: EnrollPatientDto, enrolledBy: string | null): Promise<LoyaltyAccount> {
    // Check for existing account
    const existing = await this.accountRepo.findOne({
      where: { patientMrn: dto.patientMrn.toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(
        `Patient MRN ${dto.patientMrn} already has loyalty account ${existing.cardNumber}`,
      );
    }

    // Resolve category — default to lowest tier (Silver)
    const category = dto.categoryId
      ? await this.categoryRepo.findOne({ where: { id: dto.categoryId, isActive: true } })
      : await this.categoryRepo.findOne({
          where: { isActive: true },
          order: { displayOrder: 'ASC' },
        });

    if (!category) throw new NotFoundException('No active card category found');

    const cardNumber = await this.generateCardNumber(category);

    // Best-effort DOB fetch from HIS for birthday campaigns
    let patientDob: string | null = null;
    let patientName = dto.patientName ?? dto.patientMrn.toUpperCase();
    try {
      const patient = await this.patientService.getByMrn(dto.patientMrn.toUpperCase());
      if (patient.dateOfBirth) patientDob = patient.dateOfBirth;
      if (patient.fullName) patientName = patient.fullName;
    } catch {
      // HIS unavailable — DOB/name will fall back to DTO values
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const account = this.accountRepo.create({
      patientMrn:         dto.patientMrn.toUpperCase(),
      patientName,
      patientMobile:      dto.phone ?? null,
      patientDob,
      cardNumber,
      cardCategoryId:     category.id,
      totalLifetimeSpend: 0,
      availablePoints:    0,
      totalPointsEarned:  0,
      phone:              dto.phone ?? null,
      status:             'ACTIVE',
      enrolledBy,
      tenantId,
    });

    let saved = await this.accountRepo.save(account).catch(async (err) => {
      // Card number collision — pull a fresh nextval and retry once
      if (String(err.message).includes('uq_loyalty_card_number')) {
        account.cardNumber = await this.generateCardNumber(category);
        return this.accountRepo.save(account);
      }
      throw err;
    }) as LoyaltyAccount;

    await this.auditService.log({
      action: 'LOYALTY_ENROLL',
      module: 'LOYALTY',
      userId: enrolledBy ?? undefined,   // null = HIS auto-sync (system)
      entityType: 'loyalty_account',
      entityId: saved.id,
      newValue: { patientMrn: saved.patientMrn, cardNumber: saved.cardNumber, tier: category.name },
    });

    // Best-effort welcome notification (non-critical)
    if (this.notificationService && dto.phone) {
      this.notificationService.send({
        phone:           dto.phone,
        channel:         'WHATSAPP',
        eventType:       'WELCOME',
        templateName:    'hdsp_welcome',
        languageCode:    'en_US',
        templateParams:  [dto.patientMrn, saved.cardNumber, category.name],
        loyaltyAccountId: saved.id,
        mrn:             saved.patientMrn,
      }).catch(err =>
        this.logger.warn(`Welcome notification failed (non-critical): ${(err as Error).message}`),
      );
    }

    const enrolled = await this.accountRepo.findOne({
      where: { id: saved.id },
      relations: ['category'],
    }) as LoyaltyAccount;

    // Push to Oracle immediately so HIS billing sees this patient from day one
    this.pushToOracle(enrolled);

    return enrolled;
  }

  // ── Auto-enroll or return existing account (used by HIS sync) ───────────
  // Unlike enroll(), this never throws ConflictException — if the patient
  // already has an account it is returned as-is.
  // Called with enrolledBy = null when triggered by the HIS auto-sync service.
  async enrollOrGet(
    mrn: string,
    patientName: string,
    patientMobile: string | null,
    patientDob: string | null,
    patientGender: string | null,
  ): Promise<LoyaltyAccount> {
    const existing = await this.accountRepo.findOne({
      where: { patientMrn: mrn.toUpperCase() },
      relations: ['category'],
    });
    if (existing) {
      // Always refresh Oracle on every sync so HIS billing has up-to-date points
      this.pushToOracle(existing);
      return existing;
    }

    // Auto-enroll: no categoryId passed → defaults to lowest tier (Silver)
    try {
      return await this.enroll(
        {
          patientMrn:  mrn,
          patientName,
          phone:       patientMobile ?? undefined,
        },
        null,   // enrolledBy = null → HIS system auto-enrollment
      );
    } catch (err) {
      const msg = (err as Error).message ?? '';
      // Card number collision (uq_loyalty_card_number) — re-fetch in case account
      // was created by a concurrent path, then give up if still not found.
      if (msg.includes('uq_loyalty_card_number') || msg.includes('duplicate key')) {
        const created = await this.accountRepo.findOne({
          where: { patientMrn: mrn.toUpperCase() },
          relations: ['category'],
        });
        if (created) return created;
      }
      throw err;
    }
  }

  // ── Paginated list with optional search + status + tier filter ───────────
  async listAccounts(
    page: number,
    limit: number,
    search?: string,
    status?: string,
    tier?: string,
    branchId?: string | null,
  ) {
    const qb = (await this.scopedAccountRepo.createQueryBuilder('a'))
      .leftJoinAndSelect('a.category', 'category')
      .orderBy('a.enrolledAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(a.patientMrn ILIKE :term OR a.cardNumber ILIKE :term OR a.patientName ILIKE :term)',
        { term },
      );
    }

    if (status) {
      qb.andWhere('a.status = :status', { status: status.toUpperCase() });
    }

    if (tier) {
      // Filter by category code: SILVER | GOLD | PLATINUM
      qb.andWhere('category.code = :tier', { tier: tier.toUpperCase() });
    }

    if (branchId) {
      qb.andWhere(`${branchFilter('a')} = :branchId`, { branchId });
    }

    const [items, total] = await qb.getManyAndCount();
    // A5.5 API Contract Audit: this backs GET /loyalty/accounts -- the
    // query-builder eager-joins `category` (also carrying its own tenantId),
    // so an explicit .select() column list is impractical here. Strip
    // post-fetch on both the account and its joined category instead.
    this.stripTenantId(items);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getAccountByMrn(mrn: string): Promise<LoyaltyAccount> {
    const account = await this.accountRepo.findOne({
      where: { patientMrn: mrn.toUpperCase() },
      relations: ['category'],
    });
    if (!account) throw new NotFoundException(`No loyalty account found for MRN ${mrn}`);
    // Push to Oracle on every lookup — ensures HIS billing screen sees current
    // points even before a new bill is raised in the session
    this.pushToOracle(account);
    // A5.5 API Contract Audit: backs GET /loyalty/accounts/mrn/:mrn -- eager
    // `category` relation makes an explicit .select() impractical, so strip
    // tenantId post-fetch instead (matches users.service.ts findOne()).
    this.stripTenantId(account);
    return account;
  }

  async getAccountByCard(cardNumber: string): Promise<LoyaltyAccount> {
    const account = await this.accountRepo.findOne({
      where: { cardNumber: cardNumber.toUpperCase() },
      relations: ['category'],
    });
    if (!account) throw new NotFoundException(`Card number ${cardNumber} not found`);
    // A5.5 API Contract Audit: backs GET /loyalty/accounts/card/:cardNumber.
    this.stripTenantId(account);
    return account;
  }

  async getAccountById(id: string): Promise<LoyaltyAccount> {
    const account = await this.accountRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!account) throw new NotFoundException(`Loyalty account ${id} not found`);
    // A5.5 API Contract Audit: backs GET /loyalty/accounts/:id (and the
    // discount-preview / transactions / redemptions endpoints that resolve
    // the account first).
    this.stripTenantId(account);
    return account;
  }

  // ── Strip tenant_id from account (+ eager category) before it reaches a
  // GET response -- see A5.5 API Contract Audit note above. ────────────────
  private stripTenantId(account: LoyaltyAccount): void;
  private stripTenantId(accounts: LoyaltyAccount[]): void;
  private stripTenantId(target: LoyaltyAccount | LoyaltyAccount[]): void {
    const list = Array.isArray(target) ? target : [target];
    for (const a of list) {
      delete (a as { tenantId?: string | null }).tenantId;
      if (a.category) delete (a.category as { tenantId?: string | null }).tenantId;
    }
  }

  /** Resolve account from either MRN or card number */
  async resolveAccount(identifier: string): Promise<LoyaltyAccount> {
    const norm = identifier.toUpperCase();
    // Card numbers start with 'ZoeConnect-'
    if (norm.startsWith('ZoeConnect-')) {
      return this.getAccountByCard(norm);
    }
    return this.getAccountByMrn(norm);
  }

  // ── Oracle bridge helper ─────────────────────────────────────────────────
  // Fire-and-forget: pushes current account state to LOYALTY_PATIENT_SUMMARY.
  // Called on enrollment and every patient lookup so the HIS billing screen
  // always sees the latest points before a bill is raised.
  private pushToOracle(account: LoyaltyAccount): void {
    if (!this.hisBridge) {
      this.logger.warn(`[BRIDGE] pushToOracle skipped — hisBridge is NULL (MRN=${account.patientMrn})`);
      return;
    }
    if (!account.category) {
      this.logger.warn(`[BRIDGE] pushToOracle skipped — account.category is NULL (MRN=${account.patientMrn})`);
      return;
    }
    const discountResult = this.pointEngine.computeDiscount(
      Number(account.availablePoints),
      account.category,
    );
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
      availablePoints:     Number(account.availablePoints),
      redeemableAmount:    discountResult.cardValue,
      discountPct:         discountResult.discountPct,
      lastBillId:          null,
      lastBillAmount:      null,
      lastBillDate:        null,
      lastTxnType:         'EARN',   // default — no specific txn context at lookup time
    }).catch(() => { /* already logged inside bridge */ });
  }

  // ── Card number: ZoeConnect-{TIER_PREFIX}-{8-digit seq} ─────────────────────────
  // Uses a PostgreSQL sequence (loyalty_card_seq) for atomic, collision-free
  // card number generation. The sequence is auto-created and fast-forwarded to
  // the current MAX on first use so existing cards are never re-issued.
  private sequenceReady = false;

  private async ensureCardSequence(): Promise<void> {
    if (this.sequenceReady) return;
    await this.accountRepo.query(`
      DO $$
      DECLARE max_val BIGINT;
      BEGIN
        -- Find highest numeric suffix across ALL existing cards
        SELECT COALESCE(MAX(
          CASE WHEN card_number ~ '^ZoeConnect-[A-Z]+-[0-9]+$'
               THEN CAST(SPLIT_PART(card_number, '-', 3) AS BIGINT)
               ELSE 0 END
        ), 0) INTO max_val FROM loyalty_accounts;

        IF NOT EXISTS (SELECT FROM pg_sequences WHERE sequencename = 'loyalty_card_seq') THEN
          EXECUTE format('CREATE SEQUENCE loyalty_card_seq START %s', max_val + 1);
        ELSE
          -- Advance sequence if it's fallen behind existing cards
          IF (SELECT last_value FROM loyalty_card_seq) <= max_val THEN
            PERFORM setval('loyalty_card_seq', max_val);
          END IF;
        END IF;
      END $$
    `);
    this.sequenceReady = true;
  }

  private async generateCardNumber(category: CardCategory): Promise<string> {
    await this.ensureCardSequence();
    const prefix = category.name.substring(0, 3).toUpperCase(); // SIL, GOL, PLA
    const rows = await this.accountRepo.query(
      `SELECT nextval('loyalty_card_seq') AS next_val`,
    ) as Array<{ next_val: string }>;
    const next = Number(rows[0].next_val);
    const seq = String(next).padStart(8, '0');
    return `ZoeConnect-${prefix}-${seq}`;
  }
}

import { Inject, Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThanOrEqual, In } from 'typeorm';
import { TokenSequence, SequenceReferenceType } from '../entities/token-sequence.entity';
import { TokenScConfig } from '../entities/token-sc-config.entity';
import { TokenLocation } from '../entities/token-location.entity';
import { TokenRecord, TokenStatus } from '../entities/token-record.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

export interface NextTokenResult {
  tokenNumber: number;
  tokenPrefix: string;
  fullToken:   string;
  /** True when the counter wrapped back to startNumber (hit maxNumber). */
  rolledOver:  boolean;
  maxNumber:   number;
  startNumber: number;
}

// Statuses that mean "this token number is still live today" -- a fresh
// issuance must never reuse one of these. Terminal statuses (COMPLETED,
// CANCELLED, SKIPPED, REISSUED) are safe to reuse only if the caller's
// maxNumber/startNumber design intentionally allows same-day reuse, which
// this module does not assume.
const NON_TERMINAL_STATUSES: TokenStatus[] = ['WAITING', 'CALLED', 'SERVING', 'RECALLED'];

@Injectable()
export class TokenSequenceService {
  private readonly logger = new Logger(TokenSequenceService.name);

  constructor(
    @InjectRepository(TokenSequence)
    private readonly seqRepo: Repository<TokenSequence>,

    @InjectRepository(TokenScConfig)
    private readonly scConfigRepo: Repository<TokenScConfig>,

    @InjectRepository(TokenLocation)
    private readonly locationRepo: Repository<TokenLocation>,

    @InjectRepository(TokenRecord)
    private readonly recordRepo: Repository<TokenRecord>,

    private readonly dataSource: DataSource,

    /**
     * Stage B (Checkpoint B3.8) — scoped repository for the QueryBuilder
     * read portion of `reconcileFromExistingRecords()` only (session-
     * resolved-only, called exclusively from `TokenKioskService.migrateAssignment()`).
     * `getNextToken()`/`resolvePrefix()`/`resolveSequenceConfig()`/
     * `hasActiveCollision()` all stay raw — every one is reached from both
     * session-resolved and chain-resolved (kiosk) issuance paths. The write
     * half of `reconcileFromExistingRecords()` (the raw-SQL upsert) also
     * stays raw — `TenantScopedRepository` has no mechanism for
     * `dataSource.query()`, per the Mechanism Coverage Matrix.
     */
    @Inject(getTenantScopedRepositoryToken(TokenRecord))
    private readonly scopedRecordRepoForReconcile: TenantScopedRepository<TokenRecord>,
  ) {}

  /**
   * Resolve maxNumber and startNumber for a reference.
   * SERVICE_CENTER reads from token_sc_config; LOCATION uses defaults.
   */
  private async resolveSequenceConfig(
    branchId: string,
    referenceType: SequenceReferenceType,
    referenceId: string,
  ): Promise<{ startNumber: number; maxNumber: number }> {
    if (referenceType === 'SERVICE_CENTER') {
      const sc = await this.scConfigRepo.findOne({
        where: { branchId, serviceCenterId: referenceId },
        select: ['startNumber', 'maxNumber'],
      });
      return {
        startNumber: sc?.startNumber ?? 1,
        maxNumber:   sc?.maxNumber   ?? 999,
      };
    }
    // LOCATION mode uses simple defaults
    return { startNumber: 1, maxNumber: 999 };
  }

  private todayStart(): Date {
    return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  }

  /**
   * Defensive safety net (not the primary synchronization mechanism -- see
   * TokenKioskService.migrateAssignment() for that): true if `candidate`
   * already belongs to a still-open token_records row issued today for this
   * reference. token_sequences is meant to be the sole source of truth for
   * "next number", but it can drift out of sync with token_records for
   * reasons outside this service's control -- a LOCATION<->SERVICE_CENTER
   * kiosk-assignment switch that skipped reconciliation, a manual DB edit,
   * a restored backup, etc. This check exists purely to stop a drifted
   * sequence from ever handing out a number that collides with a token
   * still actively in play (WAITING/CALLED/SERVING/RECALLED) today.
   */
  private async hasActiveCollision(
    referenceType: SequenceReferenceType,
    referenceId: string,
    candidate: number,
  ): Promise<boolean> {
    const existing = await this.recordRepo.findOne({
      where: {
        referenceType,
        referenceId,
        tokenNumber: candidate,
        issuedAt: MoreThanOrEqual(this.todayStart()),
        status: In(NON_TERMINAL_STATUSES),
      },
    });
    return !!existing;
  }

  /**
   * Atomically upsert + increment the daily token sequence.
   *
   * GAP-20: Enforces maxNumber/startNumber from sc config.
   * If the incremented value exceeds maxNumber, resets to startNumber
   * and returns rolledOver=true so the caller can emit a WS notification.
   *
   * Defensive safety net: after computing a candidate number (whether from
   * a normal increment or a rollover reset), checks token_records for a
   * same-day collision with a still-open token and, if found, advances
   * again rather than handing out a number that's already in play. This is
   * a last-resort guard against sequence drift -- the real fix for drift is
   * keeping token_sequences reconciled whenever a queue's issuance path
   * changes (see TokenKioskService.migrateAssignment()).
   */
  async getNextToken(
    branchId: string,
    referenceType: SequenceReferenceType,
    referenceId: string,
  ): Promise<NextTokenResult> {
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // Neither depends on the other's result -- previously two sequential
    // DB round trips on every single token issue (kiosk print), part of
    // what made the kiosk's "please wait" screen feel slow to appear.
    const [prefix, { startNumber, maxNumber }] = await Promise.all([
      this.resolvePrefix(branchId, referenceType, referenceId),
      this.resolveSequenceConfig(branchId, referenceType, referenceId),
    ]);

    this.logger.debug(
      `getNextToken: branchId=${branchId} type=${referenceType} ref=${referenceId} ` +
      `date=${today} start=${startNumber} max=${maxNumber}`,
    );

    let tokenNumber = 0;
    let rolledOver  = false;

    // Safety cap -- collisions should be rare (only when the sequence has
    // drifted out of sync with token_records). This bounds the retry loop
    // so a pathological amount of drift fails loudly instead of looping.
    const MAX_ATTEMPTS = 50;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Single atomic statement: upsert + increment.
      // ON CONFLICT DO UPDATE always fires, so RETURNING always returns a row.
      const rows: Array<{ current_number: string | number }> = await this.dataSource.query(
        `INSERT INTO token_sequences (branch_id, reference_type, reference_id, seq_date, current_number)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (branch_id, reference_type, reference_id, seq_date)
         DO UPDATE SET current_number = token_sequences.current_number + 1
         RETURNING current_number`,
        [branchId, referenceType, referenceId, today, startNumber],
      );

      if (!rows || rows.length === 0) {
        throw new InternalServerErrorException(
          `Token sequence upsert returned no rows for ${branchId}/${referenceType}/${referenceId}`,
        );
      }

      let candidate = Number(rows[0].current_number);

      if (isNaN(candidate) || candidate <= 0) {
        throw new InternalServerErrorException(
          `Token sequence returned invalid number: ${JSON.stringify(rows[0])}`,
        );
      }

      // GAP-20: Enforce maxNumber -- rollover to startNumber
      let thisRollover = false;
      if (candidate > maxNumber) {
        await this.dataSource.query(
          `UPDATE token_sequences
              SET current_number = $5
            WHERE branch_id = $1
              AND reference_type = $2
              AND reference_id = $3
              AND seq_date = $4`,
          [branchId, referenceType, referenceId, today, startNumber],
        );
        candidate     = startNumber;
        thisRollover  = true;
        this.logger.warn(
          `Token sequence rolled over for ${branchId}/${referenceType}/${referenceId}: ` +
          `reset to ${startNumber} (maxNumber=${maxNumber})`,
        );
      }

      // eslint-disable-next-line no-await-in-loop
      const collides = await this.hasActiveCollision(referenceType, referenceId, candidate);
      if (!collides) {
        tokenNumber = candidate;
        rolledOver  = rolledOver || thisRollover;
        break;
      }

      this.logger.warn(
        `Token ${candidate} for ${branchId}/${referenceType}/${referenceId} already has an ` +
        `open token_records row today -- sequence has drifted out of sync. Advancing past it ` +
        `(attempt ${attempt + 1}/${MAX_ATTEMPTS}).`,
      );
      rolledOver = rolledOver || thisRollover;
      // Loop again -- current_number has already moved forward via the
      // UPDATE above, so the next iteration naturally tries the next number.
    }

    if (tokenNumber === 0) {
      throw new InternalServerErrorException(
        `Could not find a free token number for ${branchId}/${referenceType}/${referenceId} ` +
        `after ${MAX_ATTEMPTS} attempts -- token_sequences may be badly out of sync with token_records.`,
      );
    }

    // No zero-padding: token 4 displays/prints as "4" (or "GEN-4"), not "004".
    // (Previously padStart(3, '0') here -- removed 2026-07-25: undocumented,
    // no config knob, and already inconsistent with
    // token/kiosk/[code]/page.tsx's print receipt, which has always shown
    // the raw unpadded number.)
    const fullToken = prefix ? `${prefix}-${tokenNumber}` : String(tokenNumber);

    this.logger.debug(
      `getNextToken result: tokenNumber=${tokenNumber} fullToken=${fullToken} rolledOver=${rolledOver}`,
    );

    return { tokenNumber, tokenPrefix: prefix, fullToken, rolledOver, maxNumber, startNumber };
  }

  /** Resolves the token prefix for the given reference. Public so TokenService can use it. */
  async resolvePrefix(
    branchId: string,
    referenceType: SequenceReferenceType,
    referenceId: string,
  ): Promise<string> {
    if (referenceType === 'SERVICE_CENTER') {
      const sc = await this.scConfigRepo.findOne({
        where: { branchId, serviceCenterId: referenceId },
      });
      return sc?.tokenPrefix ?? '';
    }

    // GAP-4 fix: read token_prefix from token_locations for LOCATION type
    if (referenceType === 'LOCATION') {
      const loc = await this.locationRepo.findOne({
        where: { id: referenceId },
        select: ['id', 'tokenPrefix'],
      });
      return loc?.tokenPrefix ?? '';
    }

    return '';
  }

  async resetBranchSequences(branchId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.dataSource.query(
      `UPDATE token_sequences SET reset_at = NOW()
        WHERE branch_id = $1 AND seq_date = $2`,
      [branchId, today],
    );
  }

  /**
   * Manual admin reset: sets current_number back to startNumber for today's sequences.
   *
   * If referenceId is supplied, resets only that reference.
   * Otherwise resets ALL sequences for the branch today.
   */
  async manualResetSequences(opts: {
    branchId:       string;
    referenceType?: string;
    referenceId?:   string;
  }): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);

    if (opts.referenceId && opts.referenceType) {
      // Reset a specific reference to its configured startNumber
      const sc = await this.scConfigRepo.findOne({
        where: { branchId: opts.branchId, serviceCenterId: opts.referenceId },
        select: ['startNumber'],
      });
      const startNumber = sc?.startNumber ?? 1;
      const res = await this.dataSource.query(
        `UPDATE token_sequences
            SET current_number = $4, reset_at = NOW()
          WHERE branch_id = $1
            AND reference_type = $2
            AND reference_id = $3
            AND seq_date = $5`,
        [opts.branchId, opts.referenceType, opts.referenceId, startNumber, today],
      );
      return res[1] ?? 0; // rowcount
    }

    // Reset ALL sequences for the branch today back to their startNumber.
    // Uses a subquery join against token_sc_config for service-center sequences;
    // location sequences default to startNumber = 1.
    const res = await this.dataSource.query(
      `UPDATE token_sequences ts
          SET current_number = COALESCE(
                (SELECT sc.start_number
                   FROM token_sc_config sc
                  WHERE sc.branch_id    = ts.branch_id
                    AND sc.service_center_id = ts.reference_id
                    AND ts.reference_type = 'SERVICE_CENTER'),
                1
              ),
              reset_at = NOW()
        WHERE ts.branch_id = $1
          AND ts.seq_date  = $2`,
      [opts.branchId, today],
    );
    return res[1] ?? 0; // rowcount
  }

  /**
   * Requirement (LOCATION -> SERVICE_CENTER migration): initialize
   * token_sequences.current_number from the highest token already issued
   * today for this reference, instead of letting a fresh row start at 0/1
   * and immediately collide with tokens issued through the queue's old
   * numbering path. Only ever moves current_number FORWARD -- never lowers
   * an existing, already-correct value.
   *
   * Returns the resulting current_number so the caller can log/report it.
   */
  async reconcileFromExistingRecords(
    branchId: string,
    referenceType: SequenceReferenceType,
    referenceId: string,
  ): Promise<number> {
    const todayStart = this.todayStart();
    const today = new Date().toISOString().slice(0, 10);

    const { startNumber } = await this.resolveSequenceConfig(branchId, referenceType, referenceId);

    const maxIssued = await (await this.scopedRecordRepoForReconcile
      .createQueryBuilder('r'))
      .select('MAX(r.tokenNumber)', 'max')
      .where('r.referenceType = :referenceType', { referenceType })
      .andWhere('r.referenceId = :referenceId', { referenceId })
      .andWhere('r.issuedAt >= :todayStart', { todayStart })
      .getRawOne<{ max: string | number | null }>();

    const highestToday = maxIssued?.max != null ? Number(maxIssued.max) : 0;
    const target = Math.max(highestToday, startNumber - 1);

    // Upsert so this also works the very first time a SERVICE_CENTER
    // reference is used (no pre-existing token_sequences row for today yet).
    await this.dataSource.query(
      `INSERT INTO token_sequences (branch_id, reference_type, reference_id, seq_date, current_number)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (branch_id, reference_type, reference_id, seq_date)
       DO UPDATE SET current_number = GREATEST(token_sequences.current_number, $5)`,
      [branchId, referenceType, referenceId, today, target],
    );

    this.logger.log(
      `Reconciled token_sequences for ${branchId}/${referenceType}/${referenceId}: ` +
      `current_number set to at least ${target} (highest issued today: ${highestToday}).`,
    );

    return target;
  }
}

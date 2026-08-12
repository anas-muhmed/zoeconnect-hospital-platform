import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

import { WorkstationConfig } from './entities/workstation-config.entity';
import { TokenLocation } from '../entities/token-location.entity';
import { TokenCounter } from '../entities/token-counter.entity';
import { BranchService, Branch, branchFilter } from '../../branch/branch.service';
import { SaveWorkstationConfigDto } from './dto/save-workstation-config.dto';
import { ChainTenantResolver } from '../../platform/tenant/resolvers/chain-tenant.resolver';

/** Workstation session tokens are long-lived (a full shift), unlike the
 *  15-minute reservation-capability tokens minted later per reservation --
 *  see registration.service.ts's mintCapabilityToken for that separate,
 *  narrower token type. This one just says "this popup speaks for a
 *  configured workstation"; it re-mints silently on every popup open, so
 *  the exact TTL mostly just bounds how long a *closed* popup's token
 *  would remain valid if somehow replayed. */
const WORKSTATION_TOKEN_TTL = '12h';

export interface WorkstationDisplayConfig {
  workstationId: string;
  branchId:      string;
  branchName:    string;
  locationId:    string;
  departmentName:    string | null;
  serviceCenterName: string | null;
  locationLabel: string;
  counterId:     string;
  counterNumber: number;
  locked:        boolean;
  configuredBy:  string | null;
  configuredAt:  Date;
}

@Injectable()
export class WorkstationService {
  constructor(
    @InjectRepository(WorkstationConfig)
    private readonly configRepo: Repository<WorkstationConfig>,

    @InjectRepository(TokenLocation)
    private readonly locationRepo: Repository<TokenLocation>,

    @InjectRepository(TokenCounter)
    private readonly counterRepo: Repository<TokenCounter>,

    private readonly branchSvc: BranchService,
    private readonly jwtService: JwtService,

    // Stage B (Checkpoint B5) — saveConfig() is the walk-up, no-login
    // bootstrap path (a fresh device configuring itself against a branch
    // picked from a public list, see listBranches()/listLocations()). Never
    // trust dto.branchId directly for tenant stamping even though it's
    // client-supplied from a legitimate public picker; resolve from the
    // already-validated `location` row's own branchId instead, matching
    // every other Pattern 3 chain's "resolve via a server-verified entity,
    // not the raw client field" discipline.
    private readonly chainResolver: ChainTenantResolver,
  ) {}

  // ── Picker options (all public -- names only, nothing sensitive) ────────

  async listBranches(): Promise<Branch[]> {
    return this.branchSvc.findAll();
  }

  // A5.5 API Contract Audit: reached from @Public() GET
  // token/workstation/options/locations (anonymous walk-up config picker) --
  // explicit select excludes tenantId from what unauthenticated traffic receives.
  async listLocations(branchId: string): Promise<TokenLocation[]> {
    if (!branchId) throw new BadRequestException('branchId is required');
    return this.locationRepo
      .createQueryBuilder('loc')
      .where('loc.is_active = true')
      .andWhere(`${branchFilter('loc')} = :branchId`, { branchId })
      .orderBy('loc.display_order', 'ASC')
      .addOrderBy('loc.label', 'ASC')
      .select([
        'loc.id', 'loc.code', 'loc.label', 'loc.isActive', 'loc.displayOrder',
        'loc.createdAt', 'loc.updatedAt', 'loc.branchId', 'loc.intrabranchId',
        'loc.departmentId', 'loc.departmentName', 'loc.serviceCenterId',
        'loc.serviceCenterName', 'loc.tokenPrefix',
      ])
      .getMany();
  }

  /**
   * Counter rows are lazily created -- a fresh location has zero
   * `token_counters` rows until an operator first joins that counter number
   * via the main queue app (see TokenService.getOrCreateCounter). That's
   * fine for the normal reception flow, but leaves this walk-up picker with
   * nothing to list on a brand-new location. So: return whatever counters
   * already exist, labelled, plus a handful of synthetic "not created yet"
   * slots (next few free counter numbers) so setup never dead-ends on an
   * empty dropdown. Picking a synthetic slot creates the real row on save
   * (see saveConfig's `new:` handling below).
   */
  async listCounters(locationId: string): Promise<Array<{ id: string; label: string; counterNumber: number }>> {
    if (!locationId) throw new BadRequestException('locationId is required');
    const existing = await this.counterRepo.find({
      where: { locationId, isActive: true },
      order: { counterNumber: 'ASC' },
    });

    const used = new Set(existing.map((c) => c.counterNumber));
    const synthetic: Array<{ id: string; label: string; counterNumber: number }> = [];
    const maxCandidate = Math.max(6, ...existing.map((c) => c.counterNumber)) + 3;
    for (let n = 1; n <= maxCandidate && synthetic.length < 3; n += 1) {
      if (used.has(n)) continue;
      synthetic.push({ id: `new:${n}`, label: `Counter ${n} (new)`, counterNumber: n });
    }

    return [
      ...existing.map((c) => ({ id: c.id, label: `Counter ${c.counterNumber}`, counterNumber: c.counterNumber })),
      ...synthetic,
    ];
  }

  // ── Bootstrap (popup open) ───────────────────────────────────────────────

  /**
   * Called by the popup on every open. Returns either `{ configured: false }`
   * (show the setup picker) or the resolved display config + a fresh
   * workstation session token (show the queue).
   */
  async bootstrap(workstationId: string): Promise<
    | { configured: false }
    | { configured: true; config: WorkstationDisplayConfig; sessionToken: string; expiresIn: string }
  > {
    const config = await this.configRepo.findOne({ where: { workstationId } });
    if (!config) return { configured: false };

    await this.configRepo.update(config.id, { lastSeenAt: new Date() });

    const display = await this.resolveDisplay(config);
    const sessionToken = this.mintSessionToken(config);

    return { configured: true, config: display, sessionToken, expiresIn: WORKSTATION_TOKEN_TTL };
  }

  // ── Save / reconfigure ───────────────────────────────────────────────────

  /**
   * Walk-up path (no login) -- refused if the workstation is currently
   * locked. First-time configuration always succeeds (nothing to be
   * locked yet).
   */
  async saveConfig(
    workstationId: string,
    dto: SaveWorkstationConfigDto,
    actorLabel: string,
    allowIfLocked: boolean,
  ): Promise<WorkstationDisplayConfig> {
    const existing = await this.configRepo.findOne({ where: { workstationId } });

    if (existing?.locked && !allowIfLocked) {
      throw new ForbiddenException({
        error:   'WORKSTATION_LOCKED',
        message: 'This workstation\'s configuration is locked. Ask a supervisor to change it.',
      });
    }

    const location = await this.locationRepo.findOne({ where: { id: dto.locationId } });
    if (!location) throw new NotFoundException(`Location ${dto.locationId} not found`);

    // `new:<counterNumber>` is a synthetic option from listCounters (see its
    // docstring) for a counter that doesn't have a row yet -- find-or-create
    // it here, the same way the main queue app lazily creates counters.
    const newMatch = /^new:(\d+)$/.exec(dto.counterId);
    let counter: TokenCounter | null;
    if (newMatch) {
      const counterNumber = parseInt(newMatch[1], 10);
      counter = await this.counterRepo.findOne({ where: { locationId: dto.locationId, counterNumber } });
      if (!counter) {
        counter = await this.counterRepo.save(
          this.counterRepo.create({ locationId: dto.locationId, counterNumber, isActive: true }),
        );
      }
    } else {
      counter = await this.counterRepo.findOne({ where: { id: dto.counterId, locationId: dto.locationId } });
    }
    if (!counter) throw new NotFoundException(`Counter ${dto.counterId} not found under that location`);

    const now = new Date();
    const tenantId = await this.chainResolver.resolveDefaultTenantIgnoringBranch(location.branchId);
    const saved = await this.configRepo.save(
      this.configRepo.create({
        ...(existing ?? {}),
        workstationId,
        branchId:     dto.branchId,
        locationId:   dto.locationId,
        counterId:    counter.id,
        configuredBy: actorLabel,
        configuredAt: now,
        lastSeenAt:   now,
        tenantId,
      }),
    );

    return this.resolveDisplay(saved);
  }

  async setLocked(workstationId: string, locked: boolean): Promise<void> {
    const existing = await this.configRepo.findOne({ where: { workstationId } });
    if (!existing) throw new NotFoundException(`Workstation ${workstationId} is not configured`);
    await this.configRepo.update(existing.id, { locked });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async resolveDisplay(config: WorkstationConfig): Promise<WorkstationDisplayConfig> {
    const [branches, location, counter] = await Promise.all([
      this.branchSvc.findAll().catch(() => [] as Branch[]),
      this.locationRepo.findOne({ where: { id: config.locationId } }),
      this.counterRepo.findOne({ where: { id: config.counterId } }),
    ]);

    const branchName = branches.find((b) => b.id === config.branchId)?.name ?? config.branchId;

    return {
      workstationId: config.workstationId,
      branchId:      config.branchId,
      branchName,
      locationId:    config.locationId,
      departmentName:    location?.departmentName ?? null,
      serviceCenterName: location?.serviceCenterName ?? null,
      locationLabel: location?.label ?? config.locationId,
      counterId:     config.counterId,
      counterNumber: counter?.counterNumber ?? 0,
      locked:        config.locked,
      configuredBy:  config.configuredBy,
      configuredAt:  config.configuredAt,
    };
  }

  private mintSessionToken(config: WorkstationConfig): string {
    return this.jwtService.sign(
      {
        sub:           `workstation:${config.workstationId}`,
        type:          'workstation',
        workstationId: config.workstationId,
        branchId:      config.branchId,
        locationId:    config.locationId,
        counterId:     config.counterId,
        jti:           randomUUID(),
      },
      { expiresIn: WORKSTATION_TOKEN_TTL },
    );
  }
}

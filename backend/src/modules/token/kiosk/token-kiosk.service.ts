import {
  Inject, Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { TokenKiosk, KioskType } from '../entities/token-kiosk.entity';
import { TokenKioskAssignment, AssignmentType } from '../entities/token-kiosk-assignment.entity';
import { TokenKioskBranding } from '../entities/token-kiosk-branding.entity';
import { TokenLocation } from '../entities/token-location.entity';
import { TokenRecord } from '../entities/token-record.entity';
import { TokenAuditService } from '../audit/token-audit.service';
import { TokenService } from '../token.service';
import { TokenSequenceService } from '../queue/token-sequence.service';
import { InjectRedis } from '../../../common/redis/redis.provider';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

// -- Slug generation ---------------------------------------------------------
// Base-32 alphabet excluding I, O, 0, 1 to avoid misreading on screens.
const SLUG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SLUG_LENGTH = 8;

function generateSlugCandidate(): string {
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return slug;
}

// -- DTOs --------------------------------------------------------------------

export interface CreateKioskDto {
  name:        string;
  kioskType:   KioskType;
  description?: string;
  // Initial assignment --- required unless DISPLAY_ONLY
  assignmentType?:    AssignmentType;
  // For SERVICE_CENTER assignment:
  departmentId?:      string;
  departmentName?:    string;
  serviceCenterId?:   string;
  serviceCenterName?: string;
  intrabranchId?:     string;
  // For LOCATION assignment:
  locationId?: string;
}

export interface AddAssignmentDto {
  assignmentType:    AssignmentType;
  departmentId?:     string;
  departmentName?:   string;
  serviceCenterId?:  string;
  serviceCenterName?: string;
  intrabranchId?:    string;
  locationId?:       string;
  displayOrder?:     number;
}

/**
 * Target shape for migrateAssignment() -- same fields as AddAssignmentDto,
 * but semantically this always describes the NEW type an existing
 * assignment is being switched to, not a brand-new independent assignment.
 */
export type MigrateAssignmentDto = AddAssignmentDto;

@Injectable()
export class TokenKioskService {
  constructor(
    @InjectRepository(TokenKiosk)
    private readonly kioskRepo: Repository<TokenKiosk>,

    @InjectRepository(TokenKioskAssignment)
    private readonly assignmentRepo: Repository<TokenKioskAssignment>,

    @InjectRepository(TokenKioskBranding)
    private readonly brandingRepo: Repository<TokenKioskBranding>,

    @InjectRepository(TokenLocation)
    private readonly locationRepo: Repository<TokenLocation>,

    @InjectRepository(TokenRecord)
    private readonly recordRepo: Repository<TokenRecord>,

    @InjectRedis()
    private readonly redis: Redis,

    private readonly auditService:    TokenAuditService,
    private readonly tokenService:    TokenService,
    private readonly sequenceService: TokenSequenceService,

    /**
     * Stage B (Checkpoint B3.8) — scoped repositories for `listKiosks()`,
     * `getById()`, `generateUniqueSlug()`, and `assertNoConflictingAssignment()`
     * only — every one of these is session-resolved-only (admin CRUD/
     * assignment routes). `getBySlug()`/`getPublicKioskConfig()` stay raw —
     * both are chain-resolved, touched by every public kiosk route.
     */
    @Inject(getTenantScopedRepositoryToken(TokenKiosk))
    private readonly scopedKioskRepo: TenantScopedRepository<TokenKiosk>,
    @Inject(getTenantScopedRepositoryToken(TokenLocation))
    private readonly scopedLocationRepo: TenantScopedRepository<TokenLocation>,
    @Inject(getTenantScopedRepositoryToken(TokenKioskAssignment))
    private readonly scopedAssignmentRepo: TenantScopedRepository<TokenKioskAssignment>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // -- Slug generation --------------------------------------------------------

  private async generateUniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const slug = generateSlugCandidate();
      const existing = await this.scopedKioskRepo.findOne({ where: { kioskSlug: slug } });
      if (!existing) return slug;
    }
    throw new ConflictException('Could not generate unique kiosk slug after 10 attempts');
  }

  private todayStart(): Date {
    return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  }

  /** Matches token.service.ts's KEY.issuedCount() date suffix exactly (local server date, unpadded). */
  private redisIssuedCountKey(locationId: string): string {
    const d = new Date();
    return `token:issued:${locationId}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  // -- CRUD -------------------------------------------------------------------

  /**
   * A5.5 API Contract Audit: eager `relations: ['assignments', 'assignments.location']`
   * makes an explicit `select` array impractical, so tenantId is stripped
   * post-fetch at every level of the tree (kiosk, each assignment, each
   * assignment's location) instead. Shared by `listKiosks()`/`getBySlug()`/
   * `getById()` -- all three return raw entities either directly (admin GET
   * routes) or as part of the anonymous kiosk/issue chain.
   */
  private _stripKioskTenant(kiosk: TokenKiosk): TokenKiosk {
    delete (kiosk as { tenantId?: string | null }).tenantId;
    kiosk.assignments = (kiosk.assignments ?? []).map((a) => {
      delete (a as { tenantId?: string | null }).tenantId;
      if (a.location) delete (a.location as { tenantId?: string | null }).tenantId;
      return a;
    });
    return kiosk;
  }

  // A5.5 API Contract Audit: admin GET token/kiosks -- strips tenantId (see _stripKioskTenant).
  async listKiosks(branchId: string): Promise<TokenKiosk[]> {
    const kiosks = await this.scopedKioskRepo.find({
      where: { branchId, isArchived: false },
      relations: ['assignments', 'assignments.location'],
      order: { createdAt: 'ASC' },
    });
    return kiosks.map((k) => this._stripKioskTenant(k));
  }

  // A5.5 API Contract Audit: backs both the admin GET token/kiosks/:slug
  // route (raw leak) AND the anonymous kiosk/issue chain (issueFromKiosk(),
  // getKioskState()) -- neither of those two public call sites reads
  // kiosk.tenantId, so stripping it here is safe either way.
  /**
   * Bug fix (2026-07-31, real incident -- Token Queue kiosk showing "1" and
   * "0 waiting" while the counter panel was already well ahead): the
   * `/kiosk/[slug]` page's state polling (`GET /token/public/state`) relied
   * entirely on `req.tenantId`, resolved by SubdomainTenantMiddleware from
   * the Host header -- which is unavailable whenever the app is reached via
   * a plain host with no subdomain (e.g. `localhost:3000` in dev, or any
   * cloud tenant without per-tenant subdomains wired up). With no tenant
   * resolved, getPublicState() either matched nothing for this kiosk's
   * assignment or, worse, briefly risked serving another tenant's cached
   * snapshot (see that method's doc comment). But kiosk config lookup
   * (`getBySlug()`, just above) already resolves the correct tenant
   * perfectly fine -- kioskSlug is looked up on the raw, unscoped repo, so
   * it doesn't depend on subdomain resolution at all. This mirrors that:
   * a small raw lookup whose only job is handing back the kiosk's own
   * (tenantId, branchId) so callers can pass them to getPublicState()
   * explicitly instead of trusting the ambient/subdomain-derived one.
   * Internal use only -- unlike getBySlug()/getById(), this deliberately
   * does NOT strip tenantId, since the caller needs it to scope the
   * downstream query correctly.
   */
  async getTenantAndBranchBySlug(slug: string): Promise<{ tenantId: string | null; branchId: string }> {
    const kiosk = await this.kioskRepo.findOne({
      where: { kioskSlug: slug, isArchived: false },
      select: ['id', 'tenantId', 'branchId'],
    });
    if (!kiosk) throw new NotFoundException(`Kiosk "${slug}" not found or archived`);
    return { tenantId: kiosk.tenantId ?? null, branchId: kiosk.branchId };
  }

  async getBySlug(slug: string): Promise<TokenKiosk> {
    const kiosk = await this.kioskRepo.findOne({
      where: { kioskSlug: slug, isArchived: false },
      relations: ['assignments', 'assignments.location'],
    });
    if (!kiosk) throw new NotFoundException(`Kiosk "${slug}" not found or archived`);
    return this._stripKioskTenant(kiosk);
  }

  // A5.5 API Contract Audit: write-adjacent read used by createKiosk()/updateKiosk()/etc.
  async getById(id: string, branchId: string): Promise<TokenKiosk> {
    const kiosk = await this.scopedKioskRepo.findOne({
      where: { id, branchId, isArchived: false },
      relations: ['assignments', 'assignments.location'],
    });
    if (!kiosk) throw new NotFoundException(`Kiosk not found`);
    return this._stripKioskTenant(kiosk);
  }

  async createKiosk(
    branchId: string,
    dto: CreateKioskDto,
    createdBy: string,
  ): Promise<TokenKiosk> {
    const slug = await this.generateUniqueSlug();
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    // Tenant-Scoped User Identity, Task 10: `TokenKiosk.tenantId` is now
    // NOT NULL (composite (tenantId, kioskSlug) unique constraint) --
    // `currentTenantIdOrNull()` can legitimately return null outside a
    // tenant-scoped request (no ambient context, or system scope), so this
    // must fail loudly here rather than let that reach a raw DB
    // NOT-NULL-violation error with a far less actionable message.
    if (!tenantId) {
      throw new BadRequestException('Cannot create a kiosk without an active tenant context.');
    }

    const kiosk = await this.kioskRepo.save(
      this.kioskRepo.create({
        branchId,
        kioskSlug: slug,
        name:      dto.name,
        kioskType: dto.kioskType,
        description: dto.description ?? null,
        createdBy,
        tenantId,
      }),
    );

    // Create initial assignment if provided
    if (dto.assignmentType && dto.kioskType !== 'DISPLAY_ONLY') {
      await this.addAssignment(kiosk.id, branchId, {
        assignmentType:    dto.assignmentType,
        departmentId:      dto.departmentId,
        departmentName:    dto.departmentName,
        serviceCenterId:   dto.serviceCenterId,
        serviceCenterName: dto.serviceCenterName,
        intrabranchId:     dto.intrabranchId,
        locationId:        dto.locationId,
      }, createdBy);
    }

    await this.auditService.log({
      branchId,
      entityType:  'token_kiosk',
      entityId:    kiosk.id,
      action:      'CREATE',
      changedBy:   createdBy,
      afterState:  { ...kiosk, slug } as unknown as Record<string, unknown>,
    });

    return this.getById(kiosk.id, branchId);
  }

  async updateKiosk(
    id: string,
    branchId: string,
    updates: Partial<Pick<TokenKiosk, 'name' | 'description' | 'isActive'>>,
    updatedBy: string,
  ): Promise<TokenKiosk> {
    const kiosk = await this.getById(id, branchId);
    const before = { ...kiosk };

    if (updates.name        !== undefined) kiosk.name        = updates.name;
    if (updates.description !== undefined) kiosk.description = updates.description ?? null;
    if (updates.isActive    !== undefined) kiosk.isActive    = updates.isActive;

    const saved = await this.kioskRepo.save(kiosk);

    await this.auditService.log({
      branchId,
      entityType:  'token_kiosk',
      entityId:    id,
      action:      'UPDATE',
      changedBy:   updatedBy,
      beforeState: before   as unknown as Record<string, unknown>,
      afterState:  saved    as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async archiveKiosk(id: string, branchId: string, archivedBy: string): Promise<void> {
    const kiosk = await this.getById(id, branchId);
    const before = { ...kiosk };

    kiosk.isArchived = true;
    kiosk.isActive   = false;
    kiosk.archivedAt = new Date();
    kiosk.archivedBy = archivedBy;

    await this.kioskRepo.save(kiosk);

    await this.auditService.log({
      branchId,
      entityType:  'token_kiosk',
      entityId:    id,
      action:      'ARCHIVE',
      changedBy:   archivedBy,
      beforeState: before as unknown as Record<string, unknown>,
    });
  }

  async disableKiosk(id: string, branchId: string, updatedBy: string): Promise<void> {
    await this.updateKiosk(id, branchId, { isActive: false }, updatedBy);
  }

  async enableKiosk(id: string, branchId: string, updatedBy: string): Promise<void> {
    await this.updateKiosk(id, branchId, { isActive: true }, updatedBy);
  }

  // -- Assignment management --------------------------------------------------

  /**
   * Enforces isolation between LOCATION-mode and SERVICE_CENTER-mode queues.
   *
   * Root cause this guards against: CEO OFFICE's kiosk assignment was
   * switched from LOCATION-type (Redis-numbered, via TokenService.issueToken())
   * to SERVICE_CENTER-type (token_sequences-numbered) by deactivating one
   * assignment and creating another, independently, with no reconciliation.
   * token_sequences started counting from zero while token_records already
   * had tokens issued under the old path -- producing an immediate
   * duplicate token number. A TokenLocation that's SC-linked
   * (service_center_id set) must never be simultaneously reachable through
   * an active LOCATION-type assignment (pointing at its own id) AND an
   * active SERVICE_CENTER-type assignment (pointing at that same
   * service_center_id) -- exactly one numbering system may own a given
   * logical queue at a time. Switching which one owns it must go through
   * migrateAssignment(), which reconciles numbering atomically instead of
   * leaving a gap for this method to catch after the fact.
   */
  private async assertNoConflictingAssignment(
    branchId: string,
    dto: {
      assignmentType:     AssignmentType;
      locationId?:        string | null;
      serviceCenterId?:   string | null;
      serviceCenterName?: string | null;
    },
  ): Promise<void> {
    if (dto.assignmentType === 'SERVICE_CENTER') {
      if (!dto.serviceCenterId) return;
      const linkedLocation = await this.scopedLocationRepo.findOne({
        where: { serviceCenterId: dto.serviceCenterId },
      });
      if (!linkedLocation) return;

      const conflicting = await this.scopedAssignmentRepo.findOne({
        where: {
          branchId,
          assignmentType: 'LOCATION',
          locationId:     linkedLocation.id,
          isActive:       true,
        },
      });
      if (conflicting) {
        throw new ConflictException(
          `Service center "${dto.serviceCenterName ?? dto.serviceCenterId}" is already reachable through ` +
          `an active LOCATION-mode kiosk assignment (location "${linkedLocation.label}"). Creating a second, ` +
          `SERVICE_CENTER-mode assignment for the same queue would issue tokens through two independent, ` +
          `uncoordinated numbering systems and produce duplicates. Use the migrate-assignment action instead, ` +
          `which switches the queue over and carries its numbering forward correctly.`,
        );
      }
      return;
    }

    if (dto.assignmentType === 'LOCATION') {
      if (!dto.locationId) return;
      const location = await this.scopedLocationRepo.findOne({ where: { id: dto.locationId } });
      if (!location?.serviceCenterId) return;

      const conflicting = await this.scopedAssignmentRepo.findOne({
        where: {
          branchId,
          assignmentType:  'SERVICE_CENTER',
          serviceCenterId: location.serviceCenterId,
          isActive:        true,
        },
      });
      if (conflicting) {
        throw new ConflictException(
          `Location "${location.label}" is linked to service center "${location.serviceCenterId}", which is ` +
          `already reachable through an active SERVICE_CENTER-mode kiosk assignment. Creating a second, ` +
          `LOCATION-mode assignment for the same queue would issue tokens through two independent, ` +
          `uncoordinated numbering systems and produce duplicates. Use the migrate-assignment action instead, ` +
          `which switches the queue over and carries its numbering forward correctly.`,
        );
      }
    }
  }

  async addAssignment(
    kioskId: string,
    branchId: string,
    dto: AddAssignmentDto,
    addedBy: string,
  ): Promise<TokenKioskAssignment> {
    const kiosk = await this.kioskRepo.findOne({ where: { id: kioskId, branchId } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');

    // MULTIPLE kiosk: only one assignment allowed
    if (kiosk.kioskType === 'MULTIPLE') {
      const existing = await this.assignmentRepo.count({
        where: { kioskId, isActive: true },
      });
      if (existing > 0) {
        throw new BadRequestException(
          'MULTIPLE-type kiosk already has one assignment. Use a SINGLE-type kiosk for multiple assignments, or MERGE INTO to add to an existing SINGLE kiosk.',
        );
      }
    }

    await this.assertNoConflictingAssignment(branchId, dto);

    const now = new Date();
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const assignment = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        kioskId,
        branchId,
        assignmentType:    dto.assignmentType,
        departmentId:      dto.departmentId      ?? null,
        departmentName:    dto.departmentName     ?? null,
        serviceCenterId:   dto.serviceCenterId    ?? null,
        serviceCenterName: dto.serviceCenterName  ?? null,
        intrabranchId:     dto.intrabranchId      ?? null,
        locationId:        dto.locationId         ?? null,
        displayOrder:      dto.displayOrder       ?? 0,
        mergedAt:          now,
        mergedBy:          addedBy,
        tenantId,
      }),
    );

    await this.auditService.log({
      branchId,
      entityType:  'token_kiosk_assignment',
      entityId:    assignment.id,
      action:      'CREATE',
      changedBy:   addedBy,
      afterState:  assignment as unknown as Record<string, unknown>,
    });

    return assignment;
  }

  async removeAssignment(
    assignmentId: string,
    kioskId: string,
    branchId: string,
    removedBy: string,
  ): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, kioskId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const before = { ...assignment };
    assignment.isActive = false;
    await this.assignmentRepo.save(assignment);

    await this.auditService.log({
      branchId,
      entityType:  'token_kiosk_assignment',
      entityId:    assignmentId,
      action:      'DELETE',
      changedBy:   removedBy,
      beforeState: before as unknown as Record<string, unknown>,
    });
  }

  /**
   * Explicit, sanctioned way to switch an assignment between LOCATION and
   * SERVICE_CENTER mode. Unlike remove+add (two independent calls with no
   * shared context -- exactly how the CEO OFFICE bug happened), this:
   *   1. Deactivates the source assignment and creates the target in one
   *      service-level operation.
   *   2. Reconciles the target's numbering source from whatever's already
   *      been issued for this queue today, so numbering continues instead
   *      of restarting and colliding with still-open tokens.
   *   3. Writes a single MIGRATE audit entry linking source and result.
   * Bypasses assertNoConflictingAssignment() deliberately -- this method IS
   * the sanctioned way past that guard.
   */
  async migrateAssignment(
    kioskId: string,
    branchId: string,
    assignmentId: string,
    dto: MigrateAssignmentDto,
    userId: string,
  ): Promise<TokenKioskAssignment> {
    const kiosk = await this.kioskRepo.findOne({ where: { id: kioskId, branchId } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');

    const source = await this.assignmentRepo.findOne({ where: { id: assignmentId, kioskId } });
    if (!source) throw new NotFoundException('Assignment not found');
    if (source.assignmentType === dto.assignmentType) {
      throw new BadRequestException('Assignment is already this type -- nothing to migrate.');
    }

    const beforeState = { ...source };

    if (dto.assignmentType === 'SERVICE_CENTER') {
      if (!dto.serviceCenterId) {
        throw new BadRequestException('serviceCenterId is required to migrate to SERVICE_CENTER mode.');
      }

      // Resolve (or create) the TokenLocation that represents this service
      // center, reusing the exact same code=SC_{id} keying every issuance
      // path already relies on.
      const scLocation = await this.tokenService.ensureLocationForServiceCenter({
        serviceCenterId:   dto.serviceCenterId,
        serviceCenterName: dto.serviceCenterName ?? source.serviceCenterName ?? '',
        departmentId:      dto.departmentId       ?? source.departmentId     ?? '',
        departmentName:    dto.departmentName     ?? source.departmentName   ?? '',
        intrabranchId:     dto.intrabranchId       ?? source.intrabranchId   ?? '',
        branchId,
      });

      // Requirement: initialize token_sequences from whatever's already
      // been issued for this queue today -- both old LOCATION-mode
      // (Redis-numbered) and any prior SERVICE_CENTER-mode records file
      // under referenceId = serviceCenterId (see TokenService.issueToken()),
      // so a single query covers history from either path.
      const reconciledTo = await this.sequenceService.reconcileFromExistingRecords(
        branchId, 'SERVICE_CENTER', dto.serviceCenterId,
      );

      source.isActive = false;
      await this.assignmentRepo.save(source);

      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      const created = await this.assignmentRepo.save(
        this.assignmentRepo.create({
          kioskId,
          branchId,
          assignmentType:    'SERVICE_CENTER',
          departmentId:      dto.departmentId      ?? source.departmentId      ?? null,
          departmentName:    dto.departmentName    ?? source.departmentName    ?? null,
          serviceCenterId:   dto.serviceCenterId,
          serviceCenterName: dto.serviceCenterName ?? source.serviceCenterName ?? null,
          intrabranchId:     dto.intrabranchId      ?? source.intrabranchId    ?? null,
          locationId:        null,
          displayOrder:      dto.displayOrder ?? source.displayOrder,
          mergedAt:          new Date(),
          mergedBy:          userId,
          tenantId,
        }),
      );

      await this.auditService.log({
        branchId,
        entityType:  'token_kiosk_assignment',
        entityId:    created.id,
        action:      'MIGRATE',
        changedBy:   userId,
        beforeState: beforeState as unknown as Record<string, unknown>,
        afterState:  {
          ...created,
          reconciledSequenceTo: reconciledTo,
          scLocationId: scLocation.id,
        } as unknown as Record<string, unknown>,
      });

      return created;
    }

    // -- SERVICE_CENTER -> LOCATION --------------------------------------------
    if (!dto.locationId) {
      throw new BadRequestException('locationId is required to migrate to LOCATION mode.');
    }
    const targetLocation = await this.locationRepo.findOne({ where: { id: dto.locationId } });
    if (!targetLocation) throw new NotFoundException('Target location not found');

    // Mirror the reconciliation for the reverse direction: seed the
    // Redis-based issuedCount counter LOCATION mode reads from so it
    // doesn't restart at 0 and collide with tokens already issued while
    // this was a SERVICE_CENTER assignment (those records still exist
    // under referenceId = the location's own serviceCenterId, if set).
    let reconciledTo = 0;
    if (targetLocation.serviceCenterId) {
      const maxRow = await this.recordRepo
        .createQueryBuilder('r')
        .select('MAX(r.tokenNumber)', 'max')
        .where('r.referenceType = :rt', { rt: 'SERVICE_CENTER' })
        .andWhere('r.referenceId = :rid', { rid: targetLocation.serviceCenterId })
        .andWhere('r.issuedAt >= :todayStart', { todayStart: this.todayStart() })
        .getRawOne<{ max: string | number | null }>();
      reconciledTo = maxRow?.max != null ? Number(maxRow.max) : 0;
      if (reconciledTo > 0) {
        await this.redis.set(this.redisIssuedCountKey(targetLocation.id), String(reconciledTo));
      }
    }

    source.isActive = false;
    await this.assignmentRepo.save(source);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const created = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        kioskId,
        branchId,
        assignmentType:    'LOCATION',
        locationId:        dto.locationId,
        departmentId:      null,
        departmentName:    null,
        serviceCenterId:   null,
        serviceCenterName: null,
        intrabranchId:     null,
        displayOrder:      dto.displayOrder ?? source.displayOrder,
        mergedAt:          new Date(),
        mergedBy:          userId,
        tenantId,
      }),
    );

    await this.auditService.log({
      branchId,
      entityType:  'token_kiosk_assignment',
      entityId:    created.id,
      action:      'MIGRATE',
      changedBy:   userId,
      beforeState: beforeState as unknown as Record<string, unknown>,
      afterState:  { ...created, reconciledIssuedCountTo: reconciledTo } as unknown as Record<string, unknown>,
    });

    return created;
  }

  // -- Public lookup (used by kiosk page, no auth) ---------------------------

  /**
   * GAP-16: Returns kiosk config + branch branding in one request.
   * The kiosk page can display hospital name, logo, colors, and welcome message
   * without a separate branding endpoint.
   */
  async getPublicKioskConfig(slug: string) {
    const kiosk = await this.kioskRepo.findOne({
      where: { kioskSlug: slug, isActive: true, isArchived: false },
      relations: ['assignments', 'assignments.location'],
    });

    if (!kiosk) throw new NotFoundException(`Kiosk "${slug}" not found or unavailable`);

    const activeAssignments = kiosk.assignments
      .filter((a) => a.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((a) => ({
        id:               a.id,
        assignmentType:   a.assignmentType,
        serviceCenterId:  a.serviceCenterId,
        serviceCenterName: a.serviceCenterName,
        locationId:       a.locationId,
        locationCode:     a.location?.code       ?? null,
        locationLabel:    a.location?.label      ?? null,
        displayOrder:     a.displayOrder,
      }));

    // GAP-16: include branding (best-effort, null fields if not configured)
    const branding = await this.brandingRepo.findOne({
      where: { branchId: kiosk.branchId },
    });

    return {
      kioskSlug:   kiosk.kioskSlug,
      kioskType:   kiosk.kioskType,
      branchId:    kiosk.branchId,
      assignments: activeAssignments,
      branding: branding ? {
        hospitalName:   branding.hospitalName,
        logoUrl:        branding.logoUrl,
        primaryColor:   branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        backgroundUrl:  branding.backgroundUrl,
        welcomeMessage: branding.welcomeMessage,
        availableLangs: branding.availableLangs,
        fontSizeMode:   branding.fontSizeMode,
        footerText:     branding.footerText,
      } : null,
    };
  }
}

import { Inject, Injectable, NotFoundException, ConflictException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisplayPage } from '../entities/display-page.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface CreateDisplayDto {
  slug:    string;
  title?:  string;
  layout?: Record<string, unknown>;
}

export interface UpdateDisplayDto {
  title?:    string;
  layout?:   Record<string, unknown>;
  isActive?: boolean;
}

@Injectable()
export class DisplayService implements OnModuleInit {
  private readonly logger = new Logger(DisplayService.name);

  constructor(
    @InjectRepository(DisplayPage)
    private readonly repo: Repository<DisplayPage>,

    /**
     * Stage B (Checkpoint B3.8) — scoped repository for `list()` only
     * (session-resolved-only, admin route). `findBySlug()` stays raw and
     * global on purpose: it is the anchor for the anonymous public
     * `@Public() GET :slug` route (`DisplayController.findBySlug()`),
     * which has no tenant context to scope by at all -- there is no auth
     * token and (in self-hosted mode) no guaranteed subdomain. This is a
     * known, tracked tenant-isolation gap, not an oversight; closing it is
     * pending a decision on the legacy `/display/:slug` route's future
     * (see the Token Display URL migration discussion), not a quick fix
     * here. `update()`/`remove()` used to also route through this same raw
     * `findBySlug()` despite being authenticated, permissioned routes with
     * a real tenant context available -- that was a genuine bug, now fixed
     * below to use `findByTenantAndSlug()` instead.
     *
     * Correction: the `TokenGateway`'s `token:join-display` handler does
     * NOT actually call `findBySlug()` (verified 2026-08-11) -- it only
     * joins a socket room and fetches unrelated queue state. The previous
     * version of this comment claiming otherwise was stale.
     */
    @Inject(getTenantScopedRepositoryToken(DisplayPage))
    private readonly scopedRepo: TenantScopedRepository<DisplayPage>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async onModuleInit() {
    this.logger.warn('--- RUNNING ONE-TIME TENANT ID CORRECTION FOR PRODUCTION DATA ---');
    try {
      // 1. Fix the Super Admin's user record so future creations use the correct tenant
      await this.repo.query(`
        UPDATE users 
        SET tenant_id = '1eb29dd3-e91a-45cd-b741-28cf04661cac' 
        WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853'
      `);
      
      // 2. Fix any Token Displays created under the wrong tenant
      await this.repo.query(`
        UPDATE display_pages 
        SET tenant_id = '1eb29dd3-e91a-45cd-b741-28cf04661cac' 
        WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853'
      `);

      // 3. Fix any CMS Displays created under the wrong tenant
      //
      // Fix (2026-08-11): this previously targeted a table literally named
      // `cms_displays`, which has never existed -- CMSDisplayAssignment's
      // real table is `cms_display_assignments` (see
      // cms-display-assignment.entity.ts's @Entity() decorator). Every
      // prior boot threw `QueryFailedError: relation "cms_displays" does
      // not exist` here, caught by the try/catch below and logged as an
      // error -- meaning step 1 (users) and step 2 (display_pages) above
      // were actually running and completing fine (they execute first,
      // sequentially, before this one ever throws), but this CMS
      // correction has silently never run anywhere, confirmed live via
      // this exact error in a real deployment's logs.
      await this.repo.query(`
        UPDATE cms_display_assignments
        SET tenant_id = '1eb29dd3-e91a-45cd-b741-28cf04661cac'
        WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853'
      `);

      this.logger.warn('--- TENANT ID CORRECTION COMPLETED ---');
    } catch (e) {
      this.logger.error('Failed to run tenant correction script', e);
    }
  }

  private static readonly SELECT = [
    'id', 'slug', 'title', 'layout', 'isActive', 'createdById', 'createdAt', 'updatedAt',
  ] as const;

  // A5.5 API Contract Audit: admin GET token/display-pages -- explicit select excludes tenantId.
  async list(activeOnly = true): Promise<DisplayPage[]> {
    return this.scopedRepo.find({
      where: activeOnly ? { isActive: true } : {},
      order: { createdAt: 'ASC' },
      select: [...DisplayService.SELECT],
    });
  }

  // A5.5 API Contract Audit: reached from @Public() GET token/display-pages/:slug
  // (anonymous TV board) AND TokenGateway's token:join-display handler --
  // explicit select excludes tenantId from what unauthenticated traffic receives.
  async findBySlug(slug: string): Promise<DisplayPage> {
    const page = await this.repo.findOne({ where: { slug }, select: [...DisplayService.SELECT] });
    if (!page) throw new NotFoundException(`Display page "${slug}" not found`);
    return page;
  }

  async findByTenantAndSlug(tenantId: string, slug: string): Promise<DisplayPage> {
    const page = await this.repo.findOne({ where: { tenantId, slug }, select: [...DisplayService.SELECT] });
    if (!page) throw new NotFoundException(`Display page "${slug}" not found`);
    return page;
  }

  async create(dto: CreateDisplayDto, userId: string): Promise<DisplayPage> {
    // Fail-fast, not currentTenantIdOrNull() — see
    // TenantContextStorage.requireTenantContext()'s doc comment; same
    // tenant-owned-write incident as CMS Displays.
    const tenantId = await this.tenantContext.requireTenantContext();

    const exists = await this.repo.findOne({ where: { slug: dto.slug, tenantId } });
    if (exists) throw new ConflictException(`Display slug "${dto.slug}" already in use`);

    return this.repo.save(
      this.repo.create({
        slug:        dto.slug,
        title:       dto.title  ?? dto.slug,
        layout:      dto.layout ?? {},
        isActive:    true,
        createdById: userId,
        tenantId,
      }),
    );
  }

  /**
   * Tenant-isolation fix: previously resolved the target row via the
   * global, unscoped `findBySlug(slug)` -- since the `(tenant_id, slug)`
   * schema change explicitly allows two tenants to share a slug, an
   * authenticated admin from tenant A could update tenant B's display page
   * of the same slug simply by knowing it. `requireTenantContext()` fails
   * fast rather than falling back to no tenant (same pattern as `create()`
   * above); the caller (`DisplayController.update()`) must have
   * `TenantContextInterceptor` applied for this to resolve.
   */
  async update(slug: string, dto: UpdateDisplayDto, _userId: string): Promise<DisplayPage> {
    const tenantId = await this.tenantContext.requireTenantContext();
    const page = await this.findByTenantAndSlug(tenantId, slug);
    if (dto.title    !== undefined) page.title    = dto.title;
    if (dto.layout   !== undefined) page.layout   = dto.layout;
    if (dto.isActive !== undefined) page.isActive = dto.isActive;
    return this.repo.save(page);
  }

  /** Tenant-isolation fix -- see `update()`'s doc comment for the incident this closes. */
  async remove(slug: string, _userId: string): Promise<void> {
    const tenantId = await this.tenantContext.requireTenantContext();
    const page = await this.findByTenantAndSlug(tenantId, slug);
    await this.repo.remove(page);
  }
}

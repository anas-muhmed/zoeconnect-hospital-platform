import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  Request, UseGuards, UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { Public }             from '../../../common/decorators/public.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { DisplayService, CreateDisplayDto, UpdateDisplayDto } from './display.service';

/**
 * GAP-6: Display page CRUD.
 *
 * Display pages are TV board configurations identified by a short slug.
 * Public GET /:slug is used by the display board page to load its layout.
 * All write operations require TOKEN:DISPLAY:MANAGE permission.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('QUEUE')
@Controller('token/display-pages')
export class DisplayController {
  constructor(private readonly displayService: DisplayService) {}

  /** List all active display pages (admin) */
  @Get()
  @RequirePermissions('TOKEN:DISPLAY:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  list() {
    return this.displayService.list();
  }

  /**
   * Get a display page by slug (public -- used by the TV board on startup).
   * Returns the full layout JSON so the board can render without auth.
   */
  @Get(':slug')
  @Public()
  findBySlug(@Param('slug') slug: string) {
    return this.displayService.findBySlug(slug);
  }

  /**
   * Create a new display page.
   *
   * Fix (2026-08-07): previously missing `TenantContextInterceptor` — the
   * same bug class found and fixed in `CmsDisplayController.create()` and
   * `CmsTickerController.create()` (see HYBRID_ARCHITECTURE_LOG.md). Without
   * it, `DisplayService.create()`'s `tenantContext.currentTenantIdOrNull()`
   * call always resolved `null` (no context established), silently stamping
   * every new display page with `tenant_id = NULL` — invisible to `list()`
   * (scoped, line 30 above) while still colliding on the raw slug-uniqueness
   * check on retry.
   */
  @Post()
  @RequirePermissions('TOKEN:DISPLAY:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async create(@Body() dto: CreateDisplayDto, @Request() req: any) {
    // DIAGNOSTIC TRACE FOR CREATION
    let tenantIdBeforeSave: string | null = null;
    try {
      tenantIdBeforeSave = await this.displayService['tenantContext'].requireTenantContext();
    } catch (e) {
      tenantIdBeforeSave = 'THREW_EXCEPTION_DURING_REQUIRE';
    }
    
    const result = await this.displayService.create(dto, req.user.id);
    return {
      ...result,
      __diagnostic: {
        principal: req.user,
        tenantIdFromContext: tenantIdBeforeSave,
        entitySaved: {
          slug: result.slug,
          tenantId: result.tenantId,
        }
      }
    };
  }

  @Get('diagnostic-db/:slug')
  @Public() // allow checking without auth to make it easy
  async checkDatabase(@Param('slug') slug: string) {
    try {
      const rawRows = await this.displayService['repo'].createQueryBuilder('dp')
        .where('dp.slug = :slug', { slug })
        .getRawMany();
        
      const tenants = await this.displayService['repo'].query(
        `SELECT id, code, name, subdomain, status, is_system FROM tenant WHERE id IN ($1, $2)`,
        ['0505dbb2-8d0c-41a4-9fcd-1bd9810ca853', '1eb29dd3-e91a-45cd-b741-28cf04661cac']
      );

      return {
        requestedSlug: slug,
        matchingRows: rawRows,
        tenants: tenants,
        exactQueryUsedInResolve: `await this.tenantRepo.findOne({ where: { code: 'camerinfolks', status: 'active' } })`,
        explanation: "AUTH_IDENTITY_MODE=global allows login by email globally, mapping the user to tenant 0505dbb2. But the player URL explicitly looks up the string 'camerinfolks', which maps to tenant 1eb29dd3. The rows above prove that these two tenants exist separately."
      };
    } catch (err: any) {
      return { error: 'Failed to run diagnostic query', details: err.message, stack: err.stack };
    }
  }

  /**
   * Update title, layout, or active state.
   *
   * Tenant-isolation fix: `TenantContextInterceptor` is now applied here
   * (it wasn't before) so `DisplayService.update()` can resolve the target
   * row via `findByTenantAndSlug()` instead of a global slug-only lookup --
   * without this interceptor, `TenantContextStorage.requireTenantContext()`
   * has no context to read and would throw for every request.
   */
  @Patch(':slug')
  @RequirePermissions('TOKEN:DISPLAY:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  update(
    @Param('slug') slug: string,
    @Body() dto: UpdateDisplayDto,
    @Request() req: any,
  ) {
    return this.displayService.update(slug, dto, req.user.id);
  }

  /** Soft-delete (set isActive = false). Tenant-isolation fix -- see `update()`'s doc comment. */
  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('TOKEN:DISPLAY:MANAGE')
  @UseInterceptors(TenantContextInterceptor)
  async remove(@Param('slug') slug: string, @Request() req: any): Promise<void> {
    await this.displayService.remove(slug, req.user.id);
  }
}

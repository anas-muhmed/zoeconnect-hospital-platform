import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ModuleRegistry } from '../../platform/infrastructure/licensing/module-registry.entity';

export interface ModuleCatalogEntry {
  code: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  icon: string | null;
  category: string | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCore: boolean;
  isPurchasable: boolean;
  isAvailable: boolean;
  features: string[];
}

const CATALOG_CACHE_TTL_MS = 30_000;

/**
 * ZoeConnect Billing, Phase 2. Single reader of `module_registry` for
 * commercial/catalog purposes -- the module a la carte pricing catalog
 * the spec calls for is `module_registry` itself (extended in Phase 1
 * with pricing columns), not a second table. Both the `/billing/modules`
 * endpoint and SubscriptionPricingService go through this service rather
 * than querying the repository directly, so "what counts as an
 * available/purchasable module" has exactly one definition.
 *
 * Production hardening: `listCatalog()` (the display-only `GET
 * /billing/modules` payload, hit on every subscription-page load) is
 * cached in-process for `CATALOG_CACHE_TTL_MS` -- module_registry rows
 * change rarely (a migration or an admin action, not per-request) and
 * this endpoint carries no per-tenant data, so a short shared TTL cache
 * is safe and removes a DB round trip from the page's hot path.
 * Deliberately NOT applied to `findByCodes()`/`listCoreModules()` --
 * those feed SubscriptionPricingService's actual price computation and
 * module validation, where a stale purchasability/price read is a real
 * correctness risk, not just a display staleness one; those stay live
 * queries. No cache invalidation hook exists yet because nothing in this
 * codebase currently writes to `module_registry` at runtime (only
 * migrations/seeds do) -- if an admin-facing "edit module pricing" UI is
 * added later, it must clear this cache (or this TTL must be lowered)
 * when it writes.
 */
@Injectable()
export class ModuleCatalogService {
  private catalogCache: { data: ModuleCatalogEntry[]; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(ModuleRegistry) private readonly moduleRepo: Repository<ModuleRegistry>,
  ) {}

  private toCatalogEntry(m: ModuleRegistry): ModuleCatalogEntry {
    return {
      code: m.code,
      name: m.name,
      shortDescription: m.shortDescription,
      description: m.description,
      icon: m.icon,
      category: m.category,
      monthlyPrice: m.monthlyPrice,
      yearlyPrice: m.yearlyPrice,
      isCore: m.isCore,
      isPurchasable: m.isPurchasable,
      isAvailable: m.isActive,
      features: m.features ?? [],
    };
  }

  /** Full catalog, active modules only -- what the subscription builder UI renders. Cached, see class doc comment. */
  async listCatalog(): Promise<ModuleCatalogEntry[]> {
    if (this.catalogCache && this.catalogCache.expiresAt > Date.now()) {
      return this.catalogCache.data;
    }
    const rows = await this.moduleRepo.find({ where: { isActive: true }, order: { displayOrder: 'ASC' } });
    const data = rows.map((m) => this.toCatalogEntry(m));
    this.catalogCache = { data, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
    return data;
  }

  /** Every module_registry row, active or not -- used internally by pricing validation, which needs to distinguish "unknown code" from "inactive code". Always live -- see class doc comment. */
  async findByCodes(codes: string[]): Promise<ModuleRegistry[]> {
    if (codes.length === 0) return [];
    return this.moduleRepo.findBy({ code: In(codes) });
  }

  /** Always live -- see class doc comment. */
  async listCoreModules(): Promise<ModuleRegistry[]> {
    return this.moduleRepo.find({ where: { isCore: true, isActive: true } });
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantContextService } from './tenant-context.service';
import { SessionTenantResolver } from './resolvers/session-tenant.resolver';
import { OracleTenantResolver } from './resolvers/oracle-tenant.resolver';
import { ChainTenantResolver } from './resolvers/chain-tenant.resolver';
import { TenantContextStorage } from './context/tenant-context-storage';
import { TenantContextInterceptor } from './context/tenant-context.interceptor';
import { SubdomainTenantMiddleware } from '../../../common/middleware/subdomain-tenant.middleware';

/**
 * Stage B (Checkpoint B1): provides the three tenant-resolution primitives
 * from `STAGE_B_DESIGN.md` §3 (session/Oracle/chain-derived). Zero
 * consumers as of B1. `TenantModule` was already imported into the app
 * tree (via `PlatformModule` -> `app.module.ts`) since Task 1.1, so no
 * wiring change was needed here to make these providers instantiable —
 * adding providers to an already-imported module with no new consumers
 * changes nothing observable, consistent with the "persistence gate"
 * reasoning used throughout Stage A.
 *
 * Stage B (Checkpoint B2): also provides `TenantContextStorage` (the
 * `AsyncLocalStorage`-backed `TenantScope` implementation) and
 * `TenantContextInterceptor`. Neither is registered as a global
 * `APP_INTERCEPTOR`/`APP_GUARD` here — B3 is where individual modules
 * opt in with `@UseInterceptors(TenantContextInterceptor)` on their own
 * controllers. `TenantScopedRepository` itself
 * (`repositories/tenant-scoped.repository.ts`) and its provider factory
 * (`repositories/tenant-scoped-repository.provider.ts`) are plain
 * exported classes/functions, not module providers — a module constructs
 * one per entity via `createTenantScopedRepositoryProvider(Entity)` in its
 * own `providers` array when it opts in during B3. Zero consumers as of B2.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [
    TenantContextService,
    SessionTenantResolver,
    OracleTenantResolver,
    ChainTenantResolver,
    TenantContextStorage,
    TenantContextInterceptor,
    // Also `new`'d up manually in main.ts for the Fastify onRequest hook
    // (see that file's doc comment for why -- Nest's Fastify middleware
    // compatibility shim can't be used here). Registered as a real
    // provider too (2026-07-20) so DI-based consumers -- TokenGateway's
    // websocket connection handler, which has no Fastify req/res to run
    // Nest middleware against at all -- can inject it and reuse
    // `resolveFromHost()` instead of duplicating subdomain-resolution logic.
    SubdomainTenantMiddleware,
  ],
  exports: [
    TypeOrmModule,
    TenantContextService,
    SessionTenantResolver,
    OracleTenantResolver,
    ChainTenantResolver,
    TenantContextStorage,
    TenantContextInterceptor,
    SubdomainTenantMiddleware,
  ],
})
export class TenantModule {}

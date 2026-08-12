import { Module, Provider, Type } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '../../../config/redis.config';
import { HisSchemaConfig }   from './his-schema-config.entity';
import { HisConfigService }  from './his-config.service';
import { HisQueryTemplateCompiler } from './his-query-template-compiler.service';
import { HisQueryDefinition } from './entities/his-query-definition.entity';
import { HisQueryDefinitionPublisherService } from './his-query-definition-publisher.service';
import { HisQueryPublishProcessor } from './his-query-publish.processor';
import { OraclePoolManager } from '../oracle-pool.service';
import { DirectOracleTransport } from '../direct-oracle.transport';
import type { CloudOracleTransport as CloudOracleTransportClass } from '../cloud-oracle.transport';
import { IOracleTransport }  from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT }  from '../../platform/infrastructure/tokens';
import { RedisProvider }     from '../../../common/redis/redis.provider';
import { User }              from '../../users/entities/user.entity';
import { Role }              from '../../rbac/entities/role.entity';
import { Tenant }            from '../../platform/tenant/entities/tenant.entity';
import { TenantModule }      from '../../platform/tenant/tenant.module';
import { ConnectorModule }   from '../../platform/connector/connector.module';

/**
 * Whether to load `CloudOracleTransport` (and therefore the `@hdsp/connector`
 * npm package it imports) AT ALL. Deliberately reads raw `process.env`, not
 * `ConfigService.get()` -- this decides whether `require('../cloud-oracle
 * .transport')` executes, which must happen while this file's `@Module()`
 * decorator metadata is being built, i.e. BEFORE `ConfigModule.forRoot()`
 * (in app.module.ts) has run and merged `.env`/`.env.local` into
 * `process.env`. Every ES `import` statement in a file required earlier in
 * the load chain than `app.module.ts`'s own `ConfigModule.forRoot()` call
 * finishes executing first -- so a `.env`-file-only value would not be
 * visible here yet. This is not a problem in practice: the only real
 * deployment that sets `cloud_relay` (infrastructure/ecs/api-task-
 * definition.json) sets it as a genuine ECS container environment
 * variable, present in `process.env` before Node even starts. Self-hosted
 * installs never set it at all (default 'direct'). If you need
 * `cloud_relay` for local dev/testing, export it as a real shell env var
 * (`set ORACLE_TRANSPORT=cloud_relay` / `export ORACLE_TRANSPORT=
 * cloud_relay`) -- putting it only in `.env`/`.env.local` will silently
 * NOT enable this.
 */
const CLOUD_RELAY_ENABLED = process.env.ORACLE_TRANSPORT === 'cloud_relay';

/**
 * Conditional, synchronous `require()` (not a static top-level `import`)
 * -- see CLOUD_RELAY_ENABLED's doc comment just above, and this module's
 * own doc comment further down ("Option 2" architecture note, 2026-07-23).
 * A self-hosted deployment (CLOUD_RELAY_ENABLED === false, the default)
 * never executes this line, so `../cloud-oracle.transport.ts` -- and
 * therefore `@hdsp/connector` (and everything it in turn needs: express,
 * socket.io-client, ioredis-for-that-purpose) -- is never loaded into the
 * self-hosted backend process at all. Previously this file had a static
 * `import { CloudOracleTransport } from '../cloud-oracle.transport'` at
 * the top, which (being a real `import`, unlike the `import type` above)
 * compiled to an unconditional top-level `require()` regardless of
 * ORACLE_TRANSPORT -- the actual root cause of the recurring "Cannot find
 * module 'socket.io-client'" / "Cannot find module 'express'" crashes a
 * self-hosted UAT install hit, since self-hosted never needed this class
 * loaded in the first place.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CloudOracleTransport: Type<CloudOracleTransportClass> | undefined = CLOUD_RELAY_ENABLED
  ? require('../cloud-oracle.transport').CloudOracleTransport
  : undefined;

/**
 * HisConfigModule
 *
 * Provides HisConfigService + OraclePoolService — imported by HisModule and
 * referenced in the vendor webhook handler (LicensingModule).
 *
 * ORACLE_TRANSPORT mode-selection (Phase 7 "Cloud Oracle Transport",
 * Task 7.2): DirectOracleTransport is always registered; CloudOracleTransport
 * is now CONDITIONALLY registered (see "Option 2" note below — this changed
 * 2026-07-23, was previously "both always registered, cheap"), selected by
 * the ORACLE_TRANSPORT env var (env.validation.ts: 'direct' | 'cloud_relay',
 * default 'direct'). Same factory-based mode-selection pattern as
 * StorageModule (Phase 3), LicensingModule (Phase 4), and NotificationModule
 * (Phase 5). Unset/'direct' is byte-for-byte Phase 2's original wiring —
 * zero behavior change for every current deployment. `OraclePoolManager`
 * itself remains a provider/export here too, for the handful of consumers
 * that need lifecycle-adjacent methods not on IOracleTransport (all
 * direct-mode only, since CloudOracleTransport has no equivalent pool to
 * expose).
 *
 * "Option 2" — self-hosted excludes @hdsp/connector entirely (2026-07-23):
 * a self-hosted UAT install kept crashing at startup with "Cannot find
 * module 'socket.io-client'", then (after that was fixed) "Cannot find
 * module 'express'" — both transitive dependencies of `@hdsp/connector`,
 * which `CloudOracleTransport` imports, but which self-hosted installs
 * (ORACLE_TRANSPORT is always 'direct' there) never actually use at
 * runtime. The previous fixes (dynamic imports inside connector/src for
 * socket.io-client and express) stopped those two specific crashes, but
 * `@hdsp/connector` was still an unconditional, load-bearing dependency of
 * every backend build, self-hosted or not — a self-hosted install had no
 * architectural reason to need that package on disk at all. `CLOUD_RELAY_
 * ENABLED`/the conditional `require()` above make loading `@hdsp/connector`
 * itself conditional on ORACLE_TRANSPORT=cloud_relay, so a self-hosted
 * install (default 'direct') never requires it, never needs it present in
 * node_modules, and can drop it from backend/package.json's effective
 * runtime footprint entirely for that build. Cloud deployments (ECS sets
 * ORACLE_TRANSPORT=cloud_relay as a real container env var) are unaffected
 * — see CLOUD_RELAY_ENABLED's own doc comment for why this still resolves
 * correctly at the point this file's @Module() decorator runs.
 *
 * Renamed `OraclePoolService` → `OraclePoolManager` (2026-07-21,
 * CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase 3): the class is no longer a
 * single-tenant singleton pool wrapper — it now resolves the ambient
 * tenant (via `TenantContextStorage`, hence the new `TenantModule` import
 * below) and lazily creates/reuses one Oracle connection pool per tenant,
 * evicting idle non-default pools after a configurable timeout. Direct
 * connectivity remains the primary architecture for BOTH self-hosted and
 * cloud (not replaced by `CloudOracleTransport`'s middleware/relay
 * strategy, which stays available as an optional, non-default connector).
 * See `oracle-pool.service.ts`'s doc comment for the full design.
 *
 * `ConnectorModule` import (Phase C, "Oracle execution path" —
 * 2026-07-21): `CloudOracleTransport` now optionally depends on
 * `ConnectorJobDispatchService`/`ConnectorDirectoryService` (both
 * `@Optional()` in its constructor) for its `'websocket'` dispatch mode
 * (`CLOUD_ORACLE_TRANSPORT_MODE`, see that class's own doc comment and
 * `ADR_CONNECTOR_PROTOCOL.md` §4) — this import is what makes those
 * tokens resolvable in this module's DI scope.
 *
 * `HisQueryTemplateCompiler` (D.2, "Dynamic Per-Tenant HIS Query
 * Architecture", 2026-07-21): a cloud-side compiler with a single public
 * `compile(tenantId, queryId, parameters)` method, internally dispatching
 * to the D.1-extracted `query-templates/*.ts` builder functions -- see
 * that class's own doc comment and `DYNAMIC_HIS_QUERY_ARCHITECTURE.md`
 * §4/§9. Registered here (not its own module) since it depends only on
 * `HisConfigService`, already this module's own provider.
 *
 * `HisQueryDefinitionPublisherService` (D.3, same design doc §5/§6/§7):
 * persists compiled definitions (`HisQueryDefinition`, hence the new
 * `TypeOrmModule.forFeature` entry below) and pushes them to a tenant's
 * connected Connector via `ConnectorGateway.pushTemplateSync()` -- depends
 * on `ConnectorGateway`/`ConnectorDirectoryService`, both already
 * resolvable here via the `ConnectorModule` import above.
 *
 * `BullModule.registerQueue(HIS_QUERY_PUBLISH)` + `HisQueryPublishProcessor`
 * (D.6, "production publication lifecycle," 2026-07-22): durable
 * retry/backoff wrapper around the publisher's two AUTOMATIC triggers
 * (connector reconnect, `HIS_CONFIG_UPDATE` webhook) -- see that
 * processor's and the publisher service's own doc comments for the full
 * rationale (manual admin-triggered republish/resync stays synchronous,
 * outside this queue).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([HisSchemaConfig, User, Role, Tenant, HisQueryDefinition]),
    TenantModule,
    ConnectorModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.HIS_QUERY_PUBLISH }),
  ],
  providers: [
    HisConfigService,
    HisQueryTemplateCompiler,
    HisQueryDefinitionPublisherService,
    HisQueryPublishProcessor,
    OraclePoolManager,
    DirectOracleTransport,
    // Only registered at all when CLOUD_RELAY_ENABLED -- see this module's
    // "Option 2" doc comment and CLOUD_RELAY_ENABLED's own comment above.
    ...(CLOUD_RELAY_ENABLED ? [CloudOracleTransport as Type<CloudOracleTransportClass>] : []),
    {
      provide: ORACLE_TRANSPORT,
      useFactory: (
        config: ConfigService,
        direct: DirectOracleTransport,
        cloud?: CloudOracleTransportClass,
      ): IOracleTransport =>
        // `cloud` is only ever injected (non-undefined) when
        // CLOUD_RELAY_ENABLED registered it above -- the `&& cloud` guard
        // is defense-in-depth for the (should-be-impossible) case of
        // ORACLE_TRANSPORT flipping between this file's module-load-time
        // read of process.env and ConfigService's own runtime read.
        config.get<string>('ORACLE_TRANSPORT', 'direct') === 'cloud_relay' && cloud ? cloud : direct,
      inject: CLOUD_RELAY_ENABLED
        ? [ConfigService, DirectOracleTransport, CloudOracleTransport as Type<CloudOracleTransportClass>]
        : [ConfigService, DirectOracleTransport],
    } as Provider,
    RedisProvider,
  ],
  exports: [HisConfigService, HisQueryTemplateCompiler, HisQueryDefinitionPublisherService, OraclePoolManager, ORACLE_TRANSPORT],
})
export class HisConfigModule {}

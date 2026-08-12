import {
  Injectable, Logger, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SessionTenantResolver } from '../resolvers/session-tenant.resolver';
import { ChainTenantResolver } from '../resolvers/chain-tenant.resolver';
import { TenantContextStorage } from './tenant-context-storage';

/**
 * The two derived-JWT principal shapes minted server-side from a non-login
 * identity (see `RegistrationService.mintCapabilityToken()` and
 * `WorkstationService.mintSessionToken()`). Neither carries a top-level
 * `tenantId` — both nest a `branchId` one level down. Confirmed at B3.8's
 * review (2026-07-15) that `SessionTenantResolver` cannot resolve a tenant
 * from either shape; both silently fell back to the seeded 'default' tenant
 * regardless of the token's real branch, identical in effect to CMS's
 * anonymous-player mis-stamping risk, but via a real signed/verified JWT and
 * a real guard pass.
 */
interface DerivedJwtPrincipal {
  isWorkstationToken?: boolean;
  isCapabilityToken?: boolean;
  workstation?: { branchId?: string | null };
  capability?: { branchId?: string | null };
}

/**
 * Stage B (Checkpoint B2) — populates `TenantContextStorage` for the
 * duration of one request, using B1's `SessionTenantResolver` against the
 * already-authenticated principal (`request.user`, set by Passport's
 * `JwtStrategy` — see `modules/auth/strategies/jwt.strategy.ts`).
 *
 * Deliberately NOT registered as a global `APP_INTERCEPTOR` in this
 * checkpoint. Registering it globally would mean every request in the
 * application immediately starts carrying ambient tenant context, which is
 * infrastructure activation, not infrastructure construction — B3 is where
 * individual modules opt in (`@UseInterceptors(TenantContextInterceptor)`
 * on their own controllers, module by module). As of B2 this class has zero
 * consumers.
 *
 * `intercept()` is `async` because tenant resolution is async
 * (`SessionTenantResolver.resolve()`). `TenantContextStorage.run()` itself
 * is synchronous, but critically, the downstream request-handling call
 * graph only actually starts once something SUBSCRIBES to the Observable
 * `next.handle()` returns -- merely calling `next.handle()` inside
 * `run()`'s callback, without subscribing to it there, does NOT run the
 * controller handler inside the AsyncLocalStorage context (fixed
 * 2026-07-20, see that fix's own doc comment on `intercept()` below for
 * the full incident -- this silently broke ambient tenant context for
 * every route using this interceptor until then). The subscription to
 * `next.handle()` must happen synchronously inside `run()`'s callback for
 * the context to actually propagate.
 *
 * Stage B (Checkpoint B5, 2026-07-15) — derived-JWT routing. Originally
 * logged at B3.8 as a deferred "SessionTenantResolver enhancement." On
 * reflection during B5 this is architecturally cleaner classified as Pattern
 * 3 (chain-derived), not a patch to Pattern 1's resolver: a
 * workstation/capability token is not a real user session, but it carries a
 * `branchId` the token issuer already resolved and embedded server-side —
 * exactly B5's "trusted chain, no session" shape (a workstation's own stored
 * config; a kiosk's location), just carried in a JWT claim instead of a
 * request param. Routing it through `ChainTenantResolver.resolveDefaultTenantIgnoringBranch()`
 * here, at the single choke point every B3.x/B5 controller already shares,
 * means no individual controller or service needed to change — the same
 * "one choke point" contract `ChainTenantResolver`'s own doc comment
 * describes for its other callers.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  constructor(
    private readonly sessionResolver: SessionTenantResolver,
    private readonly chainResolver: ChainTenantResolver,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const principal = (request as {
      user?: { tenantId?: string | null } & DerivedJwtPrincipal;
    })?.user ?? null;

    const tenantId = principal?.isWorkstationToken
      ? await this.chainResolver.resolveDefaultTenantIgnoringBranch(principal.workstation?.branchId ?? null)
      : principal?.isCapabilityToken
        ? await this.chainResolver.resolveDefaultTenantIgnoringBranch(principal.capability?.branchId ?? null)
        : await this.sessionResolver.resolve(principal);

    // TEMP DIAGNOSTIC (2026-07-20) -- investigating a cross-tenant leak in
    // Token Queue locations traced to `currentTenantIdOrNull()` returning
    // null downstream despite this interceptor being applied. Logged at
    // `warn` so it shows regardless of configured log level. Safe to
    // remove once resolved.
    this.logger.warn(
      `[tenant-interceptor] route=${request.method} ${request.url} principalPresent=${!!principal} ` +
      `principalTenantId=${principal?.tenantId ?? '(none)'} isWorkstation=${!!principal?.isWorkstationToken} ` +
      `isCapability=${!!principal?.isCapabilityToken} resolvedTenantId=${tenantId ?? '(none)'}`,
    );

    // Fix (2026-07-20, real incident -- Token Queue locations cross-tenant
    // leak, ultimately traced here): `TenantContextStorage.run(tenantId, ()
    // => next.handle())` looked correct (and this class's own doc comment
    // above claimed the entire downstream call graph runs inside the
    // AsyncLocalStorage context "per Node's standard propagation through
    // promise/microtask chains") but this is wrong for `next.handle()`
    // specifically: it returns a COLD RxJS Observable -- calling it does
    // NOT execute the controller handler. The actual execution (and every
    // promise/microtask it spawns) only starts once something SUBSCRIBES
    // to that Observable, and Nest's own framework code does that
    // subscription itself, in a later tick, OUTSIDE this method's
    // synchronous call stack (this method is `async`, so even returning
    // the Observable already crosses a microtask boundary before Nest ever
    // sees it). Node's AsyncLocalStorage only propagates to async
    // resources (promises, timers, etc.) that are actually CREATED while
    // still inside `run()`'s synchronous callback -- merely constructing a
    // cold Observable inside that callback, without subscribing to it,
    // creates no such resource yet. Net effect: `TenantContextStorage`'s
    // context was established and then immediately torn down before the
    // controller method (and everything it calls) ever ran, so every
    // consumer of `currentTenantIdOrNull()` downstream of ANY route using
    // this interceptor saw no context at all -- not a wrong tenant, no
    // tenant. This was invisible to this session's earlier unit tests
    // (SettingsService, TokenService, etc.) because those tests call
    // `TenantContextStorage.run(tenantId, () => service.method())`
    // directly against the service, bypassing this interceptor and its
    // Observable-timing bug entirely.
    //
    // Fix: subscribe to `next.handle()` SYNCHRONOUSLY inside `run()`'s
    // callback (not just construct it), so the real execution -- and
    // every promise it spawns -- is actually created within the
    // AsyncLocalStorage dynamic scope. The interceptor's own returned
    // Observable just forwards whatever the inner subscription emits.
    return new Observable((subscriber) => {
      TenantContextStorage.run(tenantId, () => {
        next.handle().subscribe({
          next:     (value) => subscriber.next(value),
          error:    (err)   => subscriber.error(err),
          complete: ()      => subscriber.complete(),
        });
      });
    });
  }
}

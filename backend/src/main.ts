import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import compression from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createLogger } from './common/utils/logger.util';
import { TenantContextService } from './modules/platform/tenant/tenant-context.service';
import { SubdomainTenantMiddleware } from './common/middleware/subdomain-tenant.middleware';

async function bootstrap() {
  const logger = createLogger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: 10 * 1024 * 1024, // 10 MB for base64 asset uploads
    }),
    { bufferLogs: true, rawBody: true },
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3001);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Also covers the popup-window HIS integration: the HIS registration page
  // calls this API directly (cross-origin, no proxy) for reserve/heartbeat/
  // release/map -- see docs/his-integration/POPUP_INTEGRATION_ARCHITECTURE.md.
  // Those calls carry a reservation-scoped bearer token, not a cookie, so
  // `credentials: true` below doesn't matter for them; CORS only needs to
  // let the browser deliver the response back to the HIS page's JS.
  // On-prem/LAN HIS deployments are already covered by the `isPrivate` regex
  // below (matches 192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost). A HIS
  // reachable over the public internet must be added via the CORS_ORIGIN
  // env var (comma-separated list) -- see app.corsOrigin config.
  const corsOriginEnv = configService.get<string>('app.corsOrigin', '');

  // Phase 8 (Task 8.7): self-hosted keeps the private-IP allowlist below
  // completely unconditionally -- this branch is read once at bootstrap and
  // never re-evaluated per request, so self-hosted's CORS behavior is
  // byte-identical to every pre-Phase-8 deployment. Cloud mode additionally
  // accepts any origin whose hostname is `<subdomain>.<CLOUD_BASE_DOMAIN>`
  // where `<subdomain>` resolves to an active Tenant (the same lookup
  // SubdomainTenantMiddleware, Task 8.2, already performs and caches) --
  // i.e. the wildcard is scoped to real, active tenants, not `*.<domain>`
  // unconditionally.
  const deploymentMode = configService.get<string>('deployment.mode', 'self_hosted');
  const cloudBaseDomain = configService.get<string>('app.cloudBaseDomain', '');

  // CRITICAL FIX (production incident, 2026-08): "ZoeConnect Identity
  // Architecture Migration, Phase 6" (see app.config.ts's `publicLoginUrl`
  // comment) moved the platform's real, shared login page onto the
  // ZoeConnect marketing site itself, at the bare apex domain
  // (`https://zoeconnect.in/login`, or `PUBLIC_LOGIN_URL` if overridden) --
  // that page's sign-in form (zoeconnect/src/components/sign-in-form.tsx)
  // is a real, first-party login form, not documentation or a demo. It
  // calls this same backend's `/auth/login` via zoeconnect's own
  // `next.config.mjs` `rewrites()`, which proxies `/api/*` straight to
  // `hdsp-backend` server-side -- Next.js rewrites forward the browser's
  // original `Origin` header unchanged, they do not make the request
  // same-origin from this backend's point of view. Confirmed in production:
  // real login attempts from `https://zoeconnect.in/login` were rejected
  // with `CORS: origin https://zoeconnect.in not allowed`, because
  // `allowedOrigins` below only ever contained `app.frontendUrl`
  // (`https://app.zoeconnect.in`, the HOSPITAL frontend) plus the
  // subdomain-wildcard branch above -- which requires a real dot-separated
  // subdomain label and, by construction, never matches a bare apex
  // hostname (`'zoeconnect.in'.endsWith('.zoeconnect.in')` is false).
  //
  // Fixed by deriving the trusted origin from `app.publicLoginUrl` itself
  // -- the SAME config value "ZoeConnect Identity Architecture Migration,
  // Phase 6" already established as the single source of truth for where
  // this shared login page lives (also used by
  // TenantProvisioningService.buildProvisioningSummary()) -- rather than
  // hardcoding the `zoeconnect.in` literal a second time here, or widening
  // the tenant-subdomain wildcard to also match a bare apex (that wildcard
  // is a distinct concern: real, dynamically-provisioned tenant
  // subdomains, not the platform's own static marketing/login domain).
  // Any future change to PUBLIC_LOGIN_URL (e.g. a staging domain, or a
  // future migration to yet another shared login surface) is picked up
  // here automatically, with zero further edits to this file. Gated to
  // cloud mode (matching the existing Phase 8 pattern just above) -- a
  // self-hosted install has no relationship to zoeconnect.in's login page
  // at all and shouldn't trust it as a CORS origin.
  let publicLoginOrigin: string | null = null;
  if (deploymentMode === 'cloud') {
    const publicLoginUrl = configService.get<string>('app.publicLoginUrl', '');
    if (publicLoginUrl) {
      try {
        publicLoginOrigin = new URL(publicLoginUrl).origin;
      } catch {
        logger.warn(`app.publicLoginUrl ('${publicLoginUrl}') is not a valid absolute URL -- its origin will NOT be added to the CORS allow-list. Login from the shared ZoeConnect login page will fail with a CORS error until PUBLIC_LOGIN_URL is corrected.`);
      }
    }
  }

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    configService.get<string>('app.frontendUrl', 'http://localhost:3000'),
    ...(publicLoginOrigin ? [publicLoginOrigin] : []),
    ...(corsOriginEnv ? corsOriginEnv.split(',').map(s => s.trim()) : []),
  ];
  // Needed unconditionally now (not just for cloud's CORS wildcard check
  // below) -- see the onRequest hook registered further down, which runs
  // for every deployment mode, self-hosted included.
  const tenantContextService = app.get(TenantContextService);

  app.enableCors({
    // `@fastify/cors` supports two distinct shapes for a function-valued
    // `origin`: synchronous callback-style `(origin, callback) => void`, or
    // async/promise-style `(origin) => Promise<boolean>` that resolves to
    // allow or throws/rejects to deny. This was previously written as
    // `async (origin, callback) => {...}` -- mixing both shapes. Its own
    // wrapper (`resolveOriginWrapper` in @fastify/cors) always checks
    // whether the function's return value is a thenable; since an `async`
    // function's return value always is, it additionally chained
    // `.then(res => cb(null, res), cb)` on top of every manual
    // `callback(null, true)` call already made inside the function body.
    // That second, automatic call resolved to `undefined` (the completion
    // value of `return callback(...)`, not a meaningful boolean), which
    // `@fastify/cors` treats as a falsy `resolvedOriginOption` and rejects
    // with its own generic `Invalid CORS origin option` error -- on every
    // single request, allowed or not, since the double-call happened
    // regardless of which branch matched. Rewritten as pure promise-style
    // (single `origin` param, no `callback`) to match the shape it
    // actually needs to be.
    origin: async (origin: string | undefined): Promise<boolean> => {
      if (!origin) return true;
      if (allowedOrigins.includes(origin)) return true;
      const isPrivate = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin);
      if (isPrivate) return true;

      if (tenantContextService && cloudBaseDomain) {
        try {
          const { hostname } = new URL(origin);
          if (hostname.endsWith(`.${cloudBaseDomain}`)) {
            const subdomain = hostname.slice(0, -(cloudBaseDomain.length + 1));
            // Reject multi-label leftovers (e.g. "a.b.hdsp.example.com") --
            // a tenant subdomain is always a single label, same assumption
            // SubdomainTenantMiddleware's extractSubdomain() makes.
            if (subdomain && !subdomain.includes('.')) {
              const tenant = await tenantContextService.resolveTenantBySubdomain(subdomain);
              if (tenant) return true;
            }
          }
        } catch {
          // Malformed Origin header -- fall through to rejection below.
        }
      }

      throw new Error(`CORS: origin ${origin} not allowed`);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
  });

  // ── Tenant resolution (Phase 8, Task 8.2) ─────────────────────────────────
  // Fix (2026-07-20, real production incident -- see SubdomainTenantMiddleware's
  // doc comment for the full writeup): this MUST be a genuine Fastify
  // `onRequest` hook, not `MiddlewareConsumer`-registered Nest middleware.
  // Nest's Fastify middleware compatibility layer (@fastify/middie) always
  // invokes Nest-style middleware with the raw Node request/response, a
  // *different* object from the real FastifyRequest/FastifyReply every
  // controller's `@Req()` receives -- req.tenantId set via Nest middleware
  // is invisible everywhere it's read. Registering directly on the Fastify
  // instance here gives the hook the exact same request/reply objects
  // downstream code sees.
  //
  // ZoeConnect Identity Architecture Migration, Phase 5: this hook still
  // runs on every request, but `TenantScopeGuard` (the one place an
  // AUTHENTICATED request's authorization depended on its result) is no
  // longer registered -- see that guard's own doc comment. What still
  // legitimately reads `request.tenantId` today: (a) login/HIS-login's own
  // tenant-scoped shadow-mode lookup (`LOGIN_TENANT_SCOPE_MODE`), which is
  // pre-authentication by definition (there's no JWT yet at login time),
  // and (b) the CORS `origin` check just above, validating a browser
  // Origin header against a known tenant subdomain -- connection-level
  // security, not per-request authorization. Neither is "authenticated
  // request organization resolution" in the sense this phase addresses.
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.decorateRequest('tenantId', undefined);
  fastifyInstance.decorateRequest('tenantCode', undefined);
  const subdomainTenantResolver = new SubdomainTenantMiddleware(tenantContextService);
  fastifyInstance.addHook('onRequest', (request: any, reply: any, done: () => void) => {
    subdomainTenantResolver.use(request, reply, done);
  });

  // ── Cookies ───────────────────────────────────────────────────────────────
  // Used exclusively by the ZoeConnect Registration widget's self-bootstrap flow
  // (POST /auth/widget-login, GET /auth/widget-bootstrap, POST /auth/widget-logout).
  // The widget is embedded same-origin (via the Nginx /hdsp/ proxy in front of
  // both HIS and ZoeConnect), so this cookie is always first-party from the
  // browser's point of view -- no third-party/ITP cookie restrictions apply.
  // Not used by the main ZoeConnect SPA, which continues to authenticate purely via
  // an Authorization header (see lib/api/client.ts) and is unaffected by this.
  await app.register(fastifyCookie);

  // ── Multipart (file uploads) ──────────────────────────────────────────────
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB per file
      files: 10,
    },
  });

  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'static', 'token-audio'),
    prefix: `/${apiPrefix}/v1/token/audio/`,
    decorateReply: false,
  });

  // ── Static files — display media uploads ─────────────────────────────────
  const uploadDir = path.join(__dirname, '..', 'uploads', 'display-media');
  fs.mkdirSync(uploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/display-media/',
    decorateReply: false,
  });

  // ── Static files — CMS media uploads ──────────────────────────────────────
  // Independent from the display-media (Custom Display) upload above --
  // separate subfolder, separate DB-backed catalog (cms_media table).
  const cmsUploadDir = path.join(__dirname, '..', 'uploads', 'cms-media');
  fs.mkdirSync(cmsUploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: cmsUploadDir,
    prefix: '/uploads/cms-media/',
    decorateReply: false,
  });

  // ── Static files — Feedback form header images (logo/banner) ─────────────
  // Independent from cms-media -- a form has at most one header image, not
  // a browsable library, so there's no DB-backed catalog table here, just
  // the file on disk (see FeedbackFormController.uploadHeaderImage).
  const feedbackUploadDir = path.join(__dirname, '..', 'uploads', 'feedback-media');
  fs.mkdirSync(feedbackUploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: feedbackUploadDir,
    prefix: '/uploads/feedback-media/',
    decorateReply: false,
  });

  // ── Static files — LifeGenX consultation audio uploads ────────────────────
  // Same unauthenticated-static-asset pattern as display-media/cms-media/
  // feedback-media above (existing platform-wide convention, not something
  // introduced for LifeGenX) -- flagged in the integration report as a
  // pre-existing pattern worth revisiting given these files are patient
  // consultation recordings, not purely cosmetic media.
  const lifegenxUploadDir = path.join(__dirname, '..', 'uploads', 'lifegenx-audio');
  fs.mkdirSync(lifegenxUploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: lifegenxUploadDir,
    prefix: '/uploads/lifegenx-audio/',
    decorateReply: false,
  });

  // ── Compression ───────────────────────────────────────────────────────────
  await app.register(compression, {
    encodings: ['gzip', 'deflate'],
    threshold: 1024,
  });

  // ── Helmet ────────────────────────────────────────────────────────────────
  await app.register(helmet, {
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // ── Routing ───────────────────────────────────────────────────────────────
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Filters & Interceptors ────────────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── Swagger ───────────────────────────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ZoeConnect API')
      .setDescription('ZoeConnect - REST API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  // Phase 9 (Task 9.6): PROCESS_ROLE='worker' never opens an HTTP port --
  // app.init() still runs every module's lifecycle hooks (DB/Redis
  // connections, Bull queue registration, etc.) so BullMQ consumers and
  // (per app.module.ts's ScheduleModule gating) cron jobs work exactly as
  // in the combined-process default, it just never binds a listener for
  // an ALB/ECS worker service to accidentally route traffic to. Default
  // 'all' (self-hosted, and anything that doesn't set PROCESS_ROLE) is
  // unaffected -- still calls app.listen() exactly as before.
  const processRole = configService.get<string>('app.processRole', 'all');
  if (processRole === 'worker') {
    await app.init();
    logger.info('Worker process started (PROCESS_ROLE=worker) — no HTTP listener bound');
  } else {
    await app.listen(port, '0.0.0.0');
    logger.info(`Server running on http://0.0.0.0:${port}`);
    logger.info(`API prefix: /${apiPrefix}/v1`);
  }
  logger.info(`Process role: ${processRole}`);
  logger.info(`Environment: ${nodeEnv}`);
  logger.info(`Environment: ${nodeEnv}`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});

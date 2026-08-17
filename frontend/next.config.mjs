import path from 'path';

const enableFormsModule = process.env.ENABLE_FORMS_MODULE === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // Allow next/image to serve SVG from /public (our own trusted assets)
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'HDSP',
    NEXT_PUBLIC_APP_VERSION: '1.0.0',
    NEXT_PUBLIC_ENABLE_FORMS_MODULE: enableFormsModule ? 'true' : 'false',
    // NEXT_PUBLIC_DEPLOYMENT_MODE removed (single-source-of-truth fix):
    // this used to bake DEPLOYMENT_MODE in at Next.js process start, which
    // meant the frontend had its own separately-maintained copy of the
    // backend's deployment mode that went stale unless this process was
    // restarted every time DEPLOYMENT_MODE changed -- confirmed to cause a
    // real bug (a cloud tenant's login page kept showing the
    // self-hosted-only Vendor Connection card because a running frontend
    // process still had the old build-time value). The one remaining
    // consumer (login/page.tsx) now reads deployment mode at runtime from
    // GET /license/status instead, so DEPLOYMENT_MODE only needs to be set
    // in one place (the backend's env) and every consumer -- backend
    // config, this frontend included -- reads it live from there. Do not
    // reintroduce a second copy of this value here.
  },

  async rewrites() {
    // Proxy /api/* → backend so browser never makes cross-origin requests
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    return [
      // Mortuary keeps its own original backend + auth (employee/admin/
      // superadmin login, cookie/JWT sessions) exactly as it runs in
      // zoe-platform standalone -- proxied here ahead of the generic
      // /api/:path* rule below (more specific rule must come first, an
      // array of Next.js rewrites is matched in order) so it doesn't fall
      // through to ZoeConnect's own backend instead.
      {
        source: '/api/mortuary/:path*',
        destination: `${process.env.MORTUARY_URL || 'http://localhost:3011'}/api/mortuary/:path*`,
      },
      // Drug Indenting keeps its own original backend + auth (userId/
      // password login against its own users table) too -- same reasoning
      // as Mortuary above.
      {
        source: '/api/drug-indenting/:path*',
        destination: `${process.env.DRUG_INDENTING_URL || 'http://localhost:3012'}/api/drug-indenting/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${backendUrl}/socket.io/:path*`,
      },
      {
        source: '/uploads/display-media/:path*',
        destination: `${backendUrl}/uploads/display-media/:path*`,
      },
      {
        source: '/uploads/cms-media/:path*',
        destination: `${backendUrl}/uploads/cms-media/:path*`,
      },
      {
        source: '/uploads/feedback-media/:path*',
        destination: `${backendUrl}/uploads/feedback-media/:path*`,
      },

      // ── zoe-platform modules: SPA-fallback for client-side routing ──────
      // Each module's own original build lives at public/<module>/ (own
      // index.html, own assets/ folder). A request for a real file in
      // there (e.g. /mortuary/assets/index-abc.js) is already served
      // directly by Next's filesystem/public check, which runs BEFORE this
      // array of rewrites -- so these rules only ever fire for a path that
      // ISN'T a real file, i.e. one of the SPA's own client-side routes
      // (e.g. /mortuary/bodies/5), and hand it the app shell so
      // react-router-dom/basename can take over, exactly like any other
      // single-page app's server-side fallback.
      { source: '/mortuary', destination: '/mortuary/index.html' },
      { source: '/mortuary/:path*', destination: '/mortuary/index.html' },
      { source: '/drug-indenting', destination: '/drug-indenting/index.html' },
      { source: '/drug-indenting/:path*', destination: '/drug-indenting/index.html' },
      { source: '/clinigrowth', destination: '/clinigrowth/index.html' },
      { source: '/clinigrowth/:path*', destination: '/clinigrowth/index.html' },

      // LifeGenX is itself a separate Next.js app (its own SSR, not a
      // static SPA -- see zoe-platform/src/modules/lifegenx/frontend), run
      // as its own `next start` process (default port 3010, override via
      // LIFEGENX_URL) and reverse-proxied here exactly like the /api/*
      // backend proxy above. Its own next.config.js already sets
      // basePath:'/lifegenx', so the prefix passes through unchanged.
      {
        source: '/lifegenx/:path*',
        destination: `${process.env.LIFEGENX_URL || 'http://localhost:3010'}/lifegenx/:path*`,
      },
    ];
  },

  async redirects() {
    // If the forms module is disabled, gracefully redirect any direct hits to the home page
    if (!enableFormsModule) {
      return [
        {
          source: '/forms/:path*',
          destination: '/',
          permanent: false,
        },
        {
          source: '/dev/canvas-sandbox',
          destination: '/',
          permanent: false,
        },
        {
          source: '/dev/form-designer-sandbox',
          destination: '/',
          permanent: false,
        }
      ];
    }
    return [];
  },

  async headers() {
    // The cross-origin /widget/* HIS Registration Assistant iframe (and its
    // frame-ancestors CSP allow-list) has been removed -- HIS now registers
    // patients via a plain Token Number field + direct API calls, no HDSP
    // route is ever framed anymore. See
    // docs/his-integration/DIRECT_TOKEN_MRN_MAPPING.md. Every route now gets
    // the same, simplest-possible framing policy: never allow this app to be
    // embedded in a frame anywhere.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },

  compress: true,
  poweredByHeader: false,

  typescript: {
    ignoreBuildErrors: !enableFormsModule,
  },
  eslint: {
    ignoreDuringBuilds: !enableFormsModule,
  },

  webpack: (config, { dev, isServer, webpack }) => {
    if (!enableFormsModule) {
      // Replace all @hdsp imports with the dummy module to prevent Webpack resolution errors
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^@hdsp\/.*/,
          path.resolve(process.cwd(), 'lib/dummy-module.js')
        )
      );
    }

    if (dev) {
      // OOM fix (2026-07): dev page chunks here are huge (~2,300 modules incl.
      // MUI + recharts, 80-90 MB of assets + inline source maps per page pack).
      // By default webpack keeps multiple pack "generations" in memory, so a
      // few compiles of heavy pages (attendance/monitoring was the heaviest)
      // exceeded Node's heap → "Committing semi space failed / external memory
      // pressure". Keep at most one generation in memory and compress packs.
      config.cache = {
        ...config.cache,
        maxMemoryGenerations: 1,
        compression: 'gzip',
      };
    }
    return config;
  },
};

export default nextConfig;

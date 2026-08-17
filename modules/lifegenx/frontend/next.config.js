// In the unified Zoe Platform this app is mounted at /lifegenx (custom
// server in the root server.js) -- basePath makes every page/asset path
// relative to that prefix. The old rewrites() proxy is gone: it existed to
// forward /api and /uploads to a separately-running backend on port 5000
// during standalone dev; in the unified platform, the backend lives in the
// same process at /api/lifegenx (see services/api.ts's NEXT_PUBLIC_API_URL
// and the /uploads mount in ../backend's router), so no cross-origin proxy
// is needed.
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '/lifegenx',
  // Root package-lock.json + this module's own both exist, which makes
  // Next guess at the workspace boundary for output file tracing --
  // pointing it at this module's own directory avoids that ambiguity.
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;

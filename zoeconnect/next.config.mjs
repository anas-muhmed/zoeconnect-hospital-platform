/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // Proxies the sign-in form's real auth call to the ZoeConnect backend
  // server-side, so the browser only ever talks to this site's own origin
  // (no CORS configuration needed on the backend, same pattern the main
  // application's own frontend already uses for its /api rewrite).
  //
  // /vendor-api/* is the same pattern for the new self-service /sign-up
  // flow (src/components/sign-up-form.tsx): it proxies to the Vendor
  // Portal backend's Public Self-Service Signup API
  // (vendor-portal/backend/src/modules/public-signup) rather than the main
  // ZoeConnect backend, since OTP verification + provisioning live there
  // (CloudTenantsService.provision() is Vendor-Portal-owned). Kept on its
  // own rewrite prefix rather than reusing /api so it's obvious at a
  // glance which backend a given request is actually going to.
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const vendorPortalUrl = process.env.VENDOR_PORTAL_URL || 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/vendor-api/:path*',
        destination: `${vendorPortalUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

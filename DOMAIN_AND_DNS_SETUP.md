# HDSP — Domain and DNS Setup Guide

**Context:** the company does not yet own a production domain. This document explains how domains/subdomains should be configured once one is acquired, grounded in exactly how the codebase resolves tenants and terminates TLS today — not aspirational SaaS-DNS theory.

---

## 1. How Tenant Routing Actually Works — `SubdomainTenantMiddleware`

This is the mechanism every other section of this document exists to feed traffic into. `backend/src/common/middleware/subdomain-tenant.middleware.ts` runs on **every** request, before any guard, and does the following:

```ts
private extractSubdomain(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].trim().toLowerCase();
  if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
  const labels = hostname.split('.');
  if (labels.length < 3) return null;      // "example.com" -- no subdomain label
  return labels[0];
}
```

It reads the HTTP **`Host` header** (not the URL path, not a query param), strips the port, rejects `localhost` and bare IP addresses outright, and requires **at least 3 dot-separated labels** (`hospital1.company.com` = 3 labels = candidate subdomain `hospital1`; `company.com` = 2 labels = no subdomain). The extracted label is passed to `TenantContextService.resolveTenantBySubdomain()`, which looks up a `Tenant` row where `subdomain = 'hospital1'`. On a match, `req.tenantId`/`req.tenantCode` are set for the rest of the request lifecycle. On no match (or no subdomain at all — e.g. a self-hosted install accessed by IP or a bare hostname), it **falls back to the `'default'` tenant** — this is exactly why self-hosted and the OCI demo server work correctly without any DNS configuration at all: there is no subdomain to extract, so the app silently serves the single `'default'` tenant.

Implication: **the Host header is the entire tenant-resolution mechanism.** Anything sitting in front of the application (Nginx, an ALB) must forward the original `Host` header unmodified for this to work — this is standard reverse-proxy behavior and is not overridden anywhere in `infrastructure/nginx/hdsp.conf` or `infrastructure/terraform/alb.tf`, but it is worth stating explicitly since it's a common misconfiguration point (a proxy that rewrites `Host` to an upstream-internal name would break tenant resolution silently, falling everyone back to `'default'`).

A second, independent check exists on top of this: `TenantScopeGuard` (global guard) cross-verifies the authenticated JWT's `tenantId` claim against the hostname-resolved `req.tenantId` — but per `HDSP_Current_Architecture_Analysis.md`, this defaults to `TENANT_SCOPE_GUARD_MODE=log-only` (logs mismatches, doesn't block), so the Host-header resolution above is, in practice, the authoritative mechanism today.

## 2. Root Domain

Not yet acquired. Once obtained (e.g. `company.com`), it plays two roles in this codebase:
- **Cloud SaaS mode:** becomes `CLOUD_BASE_DOMAIN` (env var, required when `DEPLOYMENT_MODE=cloud`, validated by `env.validation.ts`). This is the domain every tenant subdomain is validated against — both by `SubdomainTenantMiddleware`'s DB lookup and by the CORS logic in `main.ts` (§5).
- **Self-hosted/demo mode:** used only for the single fixed hostname in `infrastructure/nginx/hdsp.conf`'s `server_name` directive (e.g. `hospital1.company.com` for a specific hospital's own subdomain, or a dedicated hostname per install) — not the wildcard mechanism described below.

## 3. Wildcard DNS — How It Works Here

For cloud/SaaS mode, exactly **one** DNS record is required, created once, manually:
```
Type: CNAME (or ALIAS/A if using Route53 with an ALB alias target)
Name: *.company.com
Value: <ALB DNS name, from terraform output alb_dns_name>
```
This is confirmed by `infrastructure/terraform/alb.tf`'s host-header rule (`host_header = ["*.${var.cloud_base_domain}", var.cloud_base_domain]`) — the ALB itself matches every subdomain via one wildcard rule, splitting traffic only by URL path (`/api/*` vs everything else), **not** by which subdomain matched. Because the ALB rule is already a wildcard, **no per-tenant DNS record is ever created** — provisioning a new tenant (`TenantProvisioningService`, `backend/src/modules/platform/tenant-provisioning/`) is purely a database operation (a `Tenant` row with a new `subdomain` value); nothing in that provisioning pipeline calls a DNS API. This was confirmed by an exhaustive repo-wide search for Route53/DNS-record-creation code — none exists. **New tenants become reachable the instant their `Tenant.subdomain` row exists and their JWT/session is issued — no DNS change is needed per tenant.**

`CLOUD_DEPLOY.md` §6 shows the exact record to create once per environment:
```
CNAME  *.staging.company.com   ->  <alb_dns_name>
CNAME  staging.company.com     ->  <alb_dns_name>
```
(and the equivalent for `production.company.com` at cutover).

## 4. Cloud Deployment DNS

| Record | Points to | Purpose |
|---|---|---|
| `*.company.com` (or `*.staging.company.com`) | ALB DNS name | Every tenant subdomain — wildcard, one-time setup |
| `company.com` (apex/root) | ALB DNS name | The ALB rule explicitly also matches the bare root domain (`var.cloud_base_domain` is included alongside the wildcard in `alb.tf`'s `host_header.values`) |
| `admin.company.com` | Vendor Portal frontend (separate service, port 4001 app, needs its own ingress/target group not detailed in the current Terraform — confirm before relying on this) | Internal vendor-operator console |
| `api.company.com` | Only needed if you want a stable non-tenant API entry point; today the ALB's `/api/*` path rule already applies under any matched host, including tenant subdomains — a dedicated `api.` host is a convenience alias, not a code requirement |
| `vendor.company.com` | Vendor Portal frontend, same caveat as `admin.` above | Alternative naming for the same service |

**ACM certificate:** must cover `*.company.com` **and** the apex `company.com`, DNS-validated, provisioned **before** `terraform apply` (`CLOUD_DEPLOY.md` §1 prerequisites; `variables.tf`'s `acm_certificate_arn` is a required input, not something Terraform creates for you in this configuration).

## 5. How CORS Interacts With Subdomains (cloud mode)

`main.ts`'s CORS origin-check, active only when `deployment.mode === 'cloud'` and `CLOUD_BASE_DOMAIN` is set, does a **real, tenant-scoped** wildcard check — not a blanket `*.company.com` allow:
```ts
if (tenantContextService && cloudBaseDomain) {
  const { hostname } = new URL(origin);
  if (hostname.endsWith(`.${cloudBaseDomain}`)) {
    const subdomain = hostname.slice(0, -(cloudBaseDomain.length + 1));
    if (subdomain && !subdomain.includes('.')) {
      const tenant = await tenantContextService.resolveTenantBySubdomain(subdomain);
      if (tenant) return true;   // only if this resolves to a real, active tenant
    }
  }
}
```
A browser origin like `https://hospital1.company.com` is only CORS-allowed if `hospital1` resolves to a real active `Tenant` row — a made-up subdomain, or a multi-label subdomain (`a.b.company.com`), is rejected. Self-hosted deployments never reach this branch at all (no `tenantContextService`/`cloudBaseDomain` constructed), so this logic is exclusively a cloud-mode concern.

## 6. Self-Hosted Deployment DNS

Optional but strongly recommended for production (not required to run the app — see §1's `'default'`-fallback behavior). A hospital typically points a single hostname at its own server:
```
A     hdsp.hospitalname.org   ->   <hospital's server public IP>
```
Then edits `infrastructure/nginx/hdsp.conf`'s `server_name` directive from the placeholder `hdsp.hospital.local` to the real hostname, and obtains a matching TLS certificate (§8). No subdomain-routing logic is exercised in this path — `SubdomainTenantMiddleware` will see a hostname with fewer than 3 labels in a typical `hdsp.hospitalname.org` case (2 labels: `hdsp` + `hospitalname.org` — actually 3 labels by the code's split-on-dot logic: `hdsp`, `hospitalname`, `org`), so it's worth being precise: `hdsp.hospitalname.org` **does** technically parse as 3 labels and would attempt a subdomain lookup for `hdsp`. Since self-hosted installs never create a `Tenant` row with `subdomain: 'hdsp'`, this lookup misses and correctly falls back to `'default'` — functionally correct, but worth understanding rather than assuming subdomain parsing is skipped for self-hosted hostnames.

## 7. OCI Demo Server DNS

Currently **none** — accessed by public IP only (`OCI_DEMO_DEPLOYMENT.md`). If/when this box gets a real hostname (e.g. `demo.company.com`), follow the self-hosted pattern in §6, not the wildcard cloud pattern in §3 — the demo server is architecturally self-hosted, not multi-tenant cloud.

## 8. SSL / TLS

**Let's Encrypt (recommended for self-hosted and the OCI demo, once each has a real hostname):** not currently automated anywhere in the repository — no `certbot` invocation, no ACME client library, no Let's Encrypt reference exists in `scripts/setup.sh`, `DEPLOY.md`, or the Nginx configs. Both currently generate/reference a **self-signed** certificate as the default (`openssl req -x509 -nodes -days 365 -newkey rsa:2048 -subj "/CN=hdsp.hospital.local"`), explicitly flagged in both files as "replace with CA cert for production." Recommended addition once a domain exists:
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d hdsp.hospitalname.org
# certbot rewrites the ssl_certificate/ssl_certificate_key paths in hdsp.conf automatically
# and installs a renewal systemd timer/cron entry
```
This is a documentation gap to close, not something already scripted — treat the above as a recommendation to add to `scripts/setup.sh`, not a description of existing automation.

**Commercial SSL (alternative for self-hosted):** obtain a cert from any CA, place at the paths `hdsp.conf` references (`/etc/nginx/ssl/hdsp.crt`, `/etc/nginx/ssl/hdsp.key`), reload Nginx. No code changes needed.

**Cloud mode (ACM):** as in §4 — an ACM certificate covering `*.company.com` + apex, DNS-validated, attached to the ALB listener. ACM handles renewal automatically once DNS validation is in place; no manual renewal process is needed here (unlike Let's Encrypt on self-hosted boxes).

## 9. Nginx Examples

**Self-hosted / OCI demo — single hostname** (`infrastructure/nginx/hdsp.conf`, condensed):
```nginx
server {
    listen 443 ssl; http2 on;
    server_name hdsp.hospitalname.org;   # replace with your real hostname
    ssl_certificate     /etc/nginx/ssl/hdsp.crt;
    ssl_certificate_key /etc/nginx/ssl/hdsp.key;

    location /api/v1/auth/login { limit_req zone=login burst=3 nodelay; proxy_pass http://hdsp_backend; }
    location /api/               { limit_req zone=api burst=50;         proxy_pass http://hdsp_backend; }
    location /socket.io/         { proxy_set_header Upgrade $http_upgrade;
                                    proxy_set_header Connection "upgrade";
                                    proxy_pass http://hdsp_backend; }
    location /                   { limit_req zone=general burst=20;     proxy_pass http://hdsp_frontend; }
}
server {
    listen 80;
    server_name hdsp.hospitalname.org;
    return 301 https://$host$request_uri;
}
```
Nginx here does **not** need wildcard `server_name` — self-hosted is single-hostname by design.

**Cloud SaaS — wildcard is handled by the ALB, not Nginx at all.** No Nginx instance sits in front of the cloud ECS deployment; the ALB terminates TLS (ACM cert) and forwards directly to the frontend/backend ECS target groups. If a per-environment Nginx were ever introduced in front of the ALB (not currently the architecture), it would need `server_name ~^(?<tenant>.+)\.company\.com$;` style regex-based wildcard matching — but this is not how the current cloud architecture works, so do not build this unless the architecture changes.

## 10. Future SaaS Tenant Subdomains — Worked Example

Given `CLOUD_BASE_DOMAIN=company.com`:

| Subdomain | Resolves to (in code) | Notes |
|---|---|---|
| `hospital1.company.com` | `Tenant` row where `subdomain = 'hospital1'` | Created by `TenantProvisioningService` — a DB insert, no DNS action needed (§3) |
| `hospital2.company.com` | `Tenant` row where `subdomain = 'hospital2'` | Same |
| `admin.company.com` | Vendor Portal frontend (separate app/deployment, not a `Tenant` row at all — `SubdomainTenantMiddleware` would attempt to resolve `admin` as a tenant subdomain if this traffic were ever routed to the HDSP backend/frontend instead of the Vendor Portal; ensure ALB/ingress rules route `admin.` to the correct service, not the tenant app) | Needs its own routing rule — not automatically excluded by any HDSP code |
| `api.company.com` | Convenience alias only, per §4 | Not required |
| `vendor.company.com` | Vendor Portal frontend, alternative to `admin.` | Same routing caveat |
| `company.com` (apex) | Marketing site / landing page, or the ALB's default frontend target group per `alb.tf`'s inclusion of the bare domain in its host-header match | Confirm intended behavior before go-live — the current Terraform matches the apex the same as any tenant subdomain, which may not be the desired marketing-site behavior |

**Important operational note:** because `admin`/`vendor`/`api` are not excluded anywhere in `SubdomainTenantMiddleware` or the ALB rules, if a `Tenant` row were ever accidentally created with `subdomain: 'admin'`, real hospital tenant traffic could theoretically collide with the intended admin console subdomain. No uniqueness-across-purpose validation exists in code beyond the DB's `UNIQUE` constraint on `Tenant.subdomain` itself — this is a process/naming-discipline concern to enforce operationally (e.g., reserve `admin`, `vendor`, `api`, `www`, `staging`, `app` as forbidden tenant subdomain values in the provisioning validation, which is not currently implemented) rather than something the codebase already prevents.

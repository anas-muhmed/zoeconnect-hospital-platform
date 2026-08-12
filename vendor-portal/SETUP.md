# HDSP Vendor Portal — Setup Guide

## Prerequisites
- Docker + Docker Compose
- The RSA key pair generated during HDSP Phase 2 setup
- Node 20+ (for local dev only)

---

## 1. Place the RSA Private Key

The private key must be at `vendor-portal/keys/license-private.pem`.
This is the same key pair generated at `D:\HDSP\backend\scripts\generate-keys.ts`.

```
vendor-portal/
  keys/
    license-private.pem   ← vendor keeps this SECRET, never share
```

The matching `license-public.pem` is bundled inside the HDSP backend
at `backend/src/modules/licensing/license.public.pem`.

---

## 2. Configure Environment

```bash
cd vendor-portal
cp .env.example .env
# Edit .env — set JWT_SECRET and DEFAULT_ADMIN_PASSWORD
```

---

## 3. Start Everything

```bash
docker-compose up -d
```

Services:
| Service           | Port | Purpose                        |
|-------------------|------|--------------------------------|
| vendor_postgres   | 5433 | Vendor database                |
| vendor_backend    | 4000 | NestJS API + Swagger at /api/docs |
| vendor_frontend   | 3001 | Next.js admin UI               |

---

## 4. First Login

Open `http://localhost:3001` → login with:
- Username: `admin`
- Password: value of `DEFAULT_ADMIN_PASSWORD` from `.env`

**Change the password immediately** via the top-right menu.

---

## 5. How Hospital Registration Works

1. Hospital admin opens HDSP → Settings → License
2. Clicks **Register with Vendor** and enters:
   - Vendor Platform URL: `http://<your-vendor-server-ip>:4000`
   - Hospital's public IP and HDSP port
3. HDSP calls `POST /api/hospitals/register` on the vendor backend
4. Vendor backend stores the hospital, issues `instanceToken` + `webhookSecret`
5. Vendor backend immediately pushes `REGISTRATION_CONFIRMED` webhook to hospital
6. Hospital appears in vendor portal → Hospitals page

---

## 6. License Request → Approval Flow

```
Hospital admin                    Vendor Portal
     │                                 │
     │── "Request License" ──────────→ │  Appears in Requests page
     │                                 │  Vendor reviews hospital details
     │                                 │  Vendor clicks Approve
     │                                 │  → Signs license with RSA private key
     │← ── LICENSE_APPROVED webhook ──│  License pushed instantly
     │  (auto-activated in seconds)    │
```

---

## 6. Revocation

From **Hospitals** page → click the revoke (🗑) button:

- **Full Revocation**: kills the entire license, optionally forces all users to log out
- **Module Revocation**: strips specific modules (e.g. remove LOYALTY only)

Both are delivered as real-time webhooks. The hospital's license cache is busted within seconds.

---

## 7. Trial Extension

From **Hospitals** page → click the extend (🔌) button:
- Pick a new expiry date and enter a reason
- Pushed as `TRIAL_EXTENDED` webhook — hospital sees updated expiry without needing a new file

---

## 8. Production Checklist

- [ ] `JWT_SECRET` set to a strong random value
- [ ] `DEFAULT_ADMIN_PASSWORD` changed after first login
- [ ] `keys/license-private.pem` present and permissions set to `600`
- [ ] `CORS_ORIGIN` set to actual vendor frontend URL
- [ ] `NEXT_PUBLIC_API_URL` points to publicly reachable backend
- [ ] Firewall: port 4000 accessible from hospital IPs only (not public internet)
- [ ] Backups configured for `vendor_postgres` volume

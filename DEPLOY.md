# HDSP — Deployment Runbook

> **Environment**: On-premise Linux server (Ubuntu 22.04 LTS recommended)
> **Stack**: Node.js 20 LTS · PostgreSQL 15 · Redis 7 · Oracle Instant Client 21 · Nginx · PM2
>
> **This is the generic self-hosted procedure.** For the environment actually running today (a demo box on Oracle Cloud Infrastructure), see `OCI_DEMO_DEPLOYMENT.md` — it is one specific, already-deployed instance of this same procedure, hosted on an OCI Compute VM instead of a hospital's own hardware. For the separate, not-yet-applied AWS multi-tenant target architecture, see `CLOUD_DEPLOY.md`.

---

## Pre-requisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 LTS | Install via `nvm` |
| npm | ≥ 10 | Bundled with Node |
| PostgreSQL | 15 | Can run in Docker |
| Redis | 7 | Can run in Docker |
| Oracle Instant Client | 21c | Required for `oracledb` thick mode |
| PM2 | latest | `npm i -g pm2` |
| Nginx | ≥ 1.24 | TLS termination + rate limiting |

---

## 1. First-Time Server Setup

```bash
# Create app user
sudo useradd -m -s /bin/bash hdsp
sudo mkdir -p /opt/hdsp /opt/hdsp/logs/pm2 /opt/hdsp/logs/backend /opt/hdsp/keys
sudo chown -R hdsp:hdsp /opt/hdsp

# Install Node.js (as hdsp user)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20 && nvm alias default 20

# Install PM2 globally
npm install -g pm2

# Install Oracle Instant Client (Basic + SDK packages)
# Download from: https://www.oracle.com/database/technologies/instant-client/downloads.html
sudo apt-get install -y libaio1
sudo mkdir /opt/oracle && cd /opt/oracle
# Upload instantclient-basic-linux.x64-21.xx.zip and unzip here
unzip instantclient-basic-linux.x64-*.zip
sudo sh -c 'echo /opt/oracle/instantclient_21_x > /etc/ld.so.conf.d/oracle.conf'
sudo ldconfig
```

---

## 2. Database Setup

### PostgreSQL (Docker — development / staging)

```bash
cd /opt/hdsp
docker compose -f infrastructure/docker-compose.yml up -d postgres redis
```

### PostgreSQL (bare-metal — production)

```bash
sudo apt-get install -y postgresql-15
sudo -u postgres psql <<EOF
CREATE USER hdsp_app WITH PASSWORD 'STRONG_PRODUCTION_PASSWORD';
CREATE DATABASE hdsp_db OWNER hdsp_app;
GRANT ALL PRIVILEGES ON DATABASE hdsp_db TO hdsp_app;
EOF
```

---

## 3. Deploy Application Code

```bash
# As hdsp user
cd /opt/hdsp

# Clone or upload release artefact
git clone https://github.com/your-org/hdsp.git .    # or rsync / scp

# ── Backend ──────────────────────────────────────────────────────
cd /opt/hdsp/backend
cp .env.example .env
# Edit .env with production values (see §4)
nano .env

npm ci --omit=dev
npm run build

# Run database migrations
npm run migration:run

# ── Frontend ─────────────────────────────────────────────────────
cd /opt/hdsp/frontend
cp .env.example .env.local
# Edit .env.local — set NEXT_PUBLIC_API_URL to your backend URL
nano .env.local

npm ci --omit=dev
npm run build
```

---

## 4. Required Environment Variables

Minimum set required before first boot. Edit `/opt/hdsp/backend/.env`:

```env
NODE_ENV=production
PORT=3001

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hdsp_db
DB_USER=hdsp_app
DB_PASSWORD=<strong-password>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<strong-redis-password>

# JWT — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<64-char-hex>
JWT_REFRESH_SECRET=<different-64-char-hex>

# License
LICENSE_PUBLIC_KEY_PATH=/opt/hdsp/keys/license.public.pem
LICENSE_TRIAL_DAYS=30

# Oracle HIS (optional — platform starts without it)
ORACLE_HOST=<his-server-ip>
ORACLE_PORT=1521
ORACLE_SERVICE=<his-service-name>
ORACLE_USER=HDSP_READONLY
ORACLE_PASSWORD=<oracle-password>
ORACLE_INSTANT_CLIENT_PATH=/opt/oracle/instantclient_21_x

# WhatsApp (optional — stub mode if not set)
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

---

## 5. RSA License Key Setup

```bash
# On vendor machine (OFFLINE — private key never leaves):
cd /opt/hdsp/scripts
npx ts-node generate-license.ts keygen

# Copy ONLY the public key to the server:
scp keys/license.public.pem hdsp@server:/opt/hdsp/keys/

# Issue first license:
npx ts-node generate-license.ts issue
# Follow the wizard — outputs a signed .json license file
# Upload the license via Settings → License in the platform UI
```

---

## 6. Start with PM2

```bash
cd /opt/hdsp

# Start all services
pm2 start infrastructure/pm2/ecosystem.config.js

# Save process list (survives reboots)
pm2 save

# Enable startup script
pm2 startup
# Follow the printed command (requires sudo)

# Verify everything is running
pm2 status
pm2 logs hdsp-backend --lines 50
```

---

## 7. Nginx Setup

```bash
# Install Nginx
sudo apt-get install -y nginx

# Generate self-signed certificate (replace with CA cert for production)
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/hdsp.key \
  -out    /etc/nginx/ssl/hdsp.crt \
  -subj   "/CN=hdsp.hospital.local"

# Copy config files
sudo cp infrastructure/nginx/nginx.conf /etc/nginx/nginx.conf
sudo cp infrastructure/nginx/hdsp.conf  /etc/nginx/conf.d/hdsp.conf

# Edit hdsp.conf — replace hostname and SSL cert paths
sudo nano /etc/nginx/conf.d/hdsp.conf

# Test and reload
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

---

## 8. Post-Deploy Checklist

```
[ ] Health check passes:          curl -k https://<server>/api/health
[ ] Liveness probe:               curl -k https://<server>/api/health/live
[ ] Frontend loads login page:    open https://<server> in browser
[ ] Default SUPER_ADMIN login works (change password immediately!)
[ ] License uploaded or trial confirmed in Settings → License
[ ] Oracle HIS connectivity shown in /api/health (status: degraded is OK)
[ ] WhatsApp notifications: test send from Notifications → Notification Log
[ ] PM2 shows all processes online: pm2 status
[ ] Log files are rotating: ls /opt/hdsp/logs/backend/combined/
```

---

## 9. Zero-Downtime Updates

```bash
# Pull new code
cd /opt/hdsp
git pull origin main

# Backend
cd backend
npm ci --omit=dev
npm run build
npm run migration:run          # always run migrations before reloading

# Frontend
cd ../frontend
npm ci --omit=dev
npm run build

# Reload (PM2 cluster keeps requests alive during reload)
cd ..
pm2 reload infrastructure/pm2/ecosystem.config.js --update-env
pm2 save
```

---

## 10. Rollback Procedure

```bash
# Identify last working commit
git log --oneline -10

# Revert to a specific tag/commit
git checkout v1.2.3

# Revert migration (if schema changed)
cd backend && npm run migration:revert

# Rebuild and reload
npm run build
pm2 reload infrastructure/pm2/ecosystem.config.js
```

---

## 11. Monitoring & Alerts

| Signal | Location | Action |
|--------|----------|--------|
| `pm2 status` shows `errored` | Terminal | `pm2 logs hdsp-backend --err --lines 100` |
| `/api/health` → `status: down` | Browser / Nagios | Check PostgreSQL / Redis service |
| Disk > 80% | `/api/health` disk check | Archive old logs: `pm2 flush` + rotate |
| `FAILED` notifications > 5% | Notifications page | Check `WHATSAPP_ACCESS_TOKEN` expiry |
| License banner shows EXPIRED | Platform UI | Issue new license via `generate-license.ts` |
| Oracle shows `unreachable` | `/api/health` | Non-critical — HIS team to investigate |

---

## 12. Log Locations

| Log | Path |
|-----|------|
| Backend (combined) | `/opt/hdsp/logs/backend/combined/hdsp-YYYY-MM-DD.log` |
| Backend (errors)   | `/opt/hdsp/logs/backend/errors/hdsp-error-YYYY-MM-DD.log` |
| PM2 stdout         | `/opt/hdsp/logs/pm2/backend-out.log` |
| PM2 stderr         | `/opt/hdsp/logs/pm2/backend-error.log` |
| Nginx access       | `/var/log/nginx/access.log` |
| Nginx error        | `/var/log/nginx/error.log` |

---

## 13. Backup

```bash
# PostgreSQL daily backup (add to cron)
pg_dump -U hdsp_app -Fc hdsp_db > /backups/hdsp_$(date +%Y%m%d).dump

# Redis RDB snapshot is configured in docker-compose.yml (saves every 60s/300s/3600s)
# RDB file: redis_data volume → /data/dump.rdb

# Cron example (daily at 02:00)
# 0 2 * * * pg_dump -U hdsp_app -Fc hdsp_db > /backups/hdsp_$(date +\%Y\%m\%d).dump
# 0 3 * * * find /backups -name "*.dump" -mtime +30 -delete
```

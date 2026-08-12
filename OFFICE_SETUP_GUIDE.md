# HDSP + Vendor Portal — Office System Setup Guide

Complete step-by-step guide to move the project from your personal laptop to the office system
and run both the Patient Loyalty Application and the Vendor Portal on the same machine.

---

## Port Map (memorise this)

| Service               | Port  | URL                          |
|-----------------------|-------|------------------------------|
| HDSP Frontend         | 3000  | http://localhost:3000        |
| HDSP Backend API      | 3001  | http://localhost:3001/api/v1 |
| PostgreSQL (HDSP)     | 5432  | —                            |
| Redis                 | 6379  | —                            |
| Vendor Portal API     | 4000  | http://localhost:4000/api    |
| Vendor Portal UI      | 4001  | http://localhost:4001        |
| PostgreSQL (Vendor)   | 5433  | —                            |

---

## PART 1 — Prepare Your Laptop Before Copying

### Step 1 — Generate the RSA Key Pair (if not done yet)

The RSA keys are what the vendor portal uses to sign licenses. Do this ONCE on your laptop.
Check if they already exist:

```
dir D:\HDSP\keys\
```

If the `keys` folder is missing or empty, generate them now:

```powershell
# Open PowerShell in D:\HDSP
cd D:\HDSP

# Create keys folder
mkdir keys

# Use the standalone node.exe bundled in the installer assets
.\installer\assets\node.exe -e "const crypto=require('crypto'),fs=require('fs');const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs1',format:'pem'}});fs.writeFileSync('keys/license-private.pem',privateKey);fs.writeFileSync('keys/license-public.pem',publicKey);"

.\bin\node.exe -e "const crypto=require('crypto'),fs=require('fs');const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs1',format:'pem'}});fs.writeFileSync('keys/license-private.pem',privateKey);fs.writeFileSync('keys/license-public.pem',publicKey);"

# Copy public key to where the HDSP backend expects it
copy keys\license-public.pem backend\src\modules\licensing\license.public.pem
```

> **Important:** `license-private.pem` is secret. Only the vendor portal needs it.
> `license-public.pem` is bundled with HDSP and is safe to share.

---

### Step 2 — Copy the Project to a USB Drive or Network Share

Copy the entire `D:\HDSP` folder. Make sure these are included:

```
D:\HDSP\
  backend\
  frontend\
  infrastructure\
  vendor-portal\
  keys\                  ← BOTH .pem files
```

> Do NOT copy `node_modules` folders — they will be reinstalled on the office system.
> You can delete them before copying to save space:
> ```powershell
> # Run in D:\HDSP
> Get-ChildItem -Path . -Filter node_modules -Recurse -Directory | Remove-Item -Recurse -Force
> ```

---

## PART 2 — Set Up the Office System

### Step 3 — Install Required Software

Install all of these on the office system:

**A. Docker Desktop**
- Download: https://www.docker.com/products/docker-desktop
- Install and restart when prompted
- After restart, open Docker Desktop and wait for it to fully start (whale icon in taskbar = green)

**B. Node.js 20 LTS**
- Download: https://nodejs.org/en/download (choose Windows Installer, LTS version)
- Install with default options
- Verify: open Command Prompt → `node --version` → should show `v20.x.x`

**C. Git (optional but recommended)**
- Download: https://git-scm.com/download/win
- Install with default options

**D. Oracle Instant Client (required for HIS patient data access)**
- Download from Oracle: https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html
- Download **Basic Package** matching your HIS Oracle version (ask hospital IT if unsure)
- Extract to `C:\oracle\instantclient`
- Add to system PATH:
  - Right-click This PC → Properties → Advanced System Settings → Environment Variables
  - Under System Variables → Path → New → add `C:\oracle\instantclient`
- Restart Command Prompt after doing this

---

### Step 4 — Place the Project Files

Paste the copied `HDSP` folder onto the office system. Recommended location:

```
D:\HDSP\     (same path as your laptop — keeps things consistent)
```

Verify the structure:
```
D:\HDSP\
  backend\
  frontend\
  infrastructure\
  vendor-portal\
  keys\
    license-private.pem
    license-public.pem
```

---

## PART 3 — Configure Environment Files

### Step 5 — HDSP Backend `.env`

```powershell
cd D:\HDSP\backend
copy .env.example .env
notepad .env
```

Fill in these values (everything else can stay as the default):

```env
NODE_ENV=production
PORT=3001

# PostgreSQL — matches the docker-compose passwords below
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hdsp_db
DB_USER=hdsp_app
DB_PASSWORD=StrongHdspPassword@2024
DB_SSL=false

# Oracle HIS — get these from your hospital IT team
ORACLE_HOST=<HIS server IP address>
ORACLE_PORT=1521
ORACLE_SERVICE=<service name from IT, e.g. HISDB or ORCL>
ORACLE_USER=HDSP_READONLY
ORACLE_PASSWORD=<oracle password from IT>
ORACLE_MODE=thick
ORACLE_INSTANT_CLIENT_PATH=C:/oracle/instantclient

# Redis — matches docker-compose password below
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=StrongRedisPassword@2024

# JWT — generate two separate random secrets
# Run in PowerShell: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<paste 128-char hex string here>
JWT_REFRESH_SECRET=<paste DIFFERENT 128-char hex string here>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# License public key path
LICENSE_PUBLIC_KEY_PATH=./keys/license-public.pem

# WhatsApp (leave disabled until configured with Meta)
WHATSAPP_ENABLED=false
```

> To generate the JWT secrets, open PowerShell and run:
> ```powershell
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```
> Run it twice and paste the two different outputs.

---

### Step 6 — HDSP Frontend `.env.local`

```powershell
cd D:\HDSP\frontend
# Create the file
notepad .env.local
```

Add this content:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

---

### Step 7 — Infrastructure `docker-compose` passwords

Open `D:\HDSP\infrastructure\docker-compose.yml` and change the default passwords
to match what you set in the `.env` above:

```yaml
# Under postgres service:
POSTGRES_PASSWORD: StrongHdspPassword@2024

# Under redis service, update --requirepass:
--requirepass StrongRedisPassword@2024
```

Also update the redis healthcheck line:
```yaml
test: ["CMD", "redis-cli", "-a", "StrongRedisPassword@2024", "ping"]
```

---

### Step 8 — Vendor Portal `.env`

```powershell
cd D:\HDSP\vendor-portal
copy .env.example .env
notepad .env
```

```env
JWT_SECRET=<another separate random 64-char hex string>
DEFAULT_ADMIN_PASSWORD=YourVendorAdminPassword@2024
CORS_ORIGIN=http://localhost:4001
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

Also update `D:\HDSP\vendor-portal\docker-compose.yml` — change the vendor postgres password
and make the frontend run on port 4001 (to avoid conflict with HDSP backend on 3001):

```yaml
# Under vendor_postgres:
POSTGRES_PASSWORD: StrongVendorPassword@2024

# Under vendor_frontend ports section, change:
ports:
  - '4001:3001'    # ← expose on 4001 externally, internal still 3001
```

---

## PART 4 — Start the Infrastructure

### Step 9 — Start HDSP PostgreSQL + Redis

Open a PowerShell window:

```powershell
cd D:\HDSP\infrastructure
docker compose up -d
```

Wait about 30 seconds, then verify both containers are running:

```powershell
docker ps
```

You should see `hdsp_postgres` and `hdsp_redis` both showing **Up**.

---

### Step 10 — Start Vendor Portal PostgreSQL

Open a second PowerShell window:

```powershell
cd D:\HDSP\vendor-portal
docker compose up -d vendor_postgres
```

Wait 20 seconds, verify `vendor_postgres` is running:

```powershell
docker ps
```

---

## PART 5 — Install Dependencies

### Step 11 — Install Node modules

Open PowerShell and run each block one at a time:

```powershell
# HDSP Backend
cd D:\HDSP\backend
npm install

# HDSP Frontend
cd D:\HDSP\frontend
npm install

# Vendor Portal Backend
cd D:\HDSP\vendor-portal\backend
npm install

# Vendor Portal Frontend
cd D:\HDSP\vendor-portal\frontend
npm install
```

Each `npm install` will take 1–3 minutes. Wait for each to finish before running the next.

---

## PART 6 — Database Setup

### Step 12 — Run HDSP Migrations

```powershell
cd D:\HDSP\backend
npm run migration:run
```

You should see output listing all 8 migrations running in order (001 through 008).
If any migration fails, check that Docker postgres is running and your `.env` DB password matches.

---

### Step 13 — Seed the HDSP Database

Run these in order:

**A. Platform seed** (roles, permissions, card categories, default super admin):
```powershell
cd D:\HDSP\backend
npm run seed
```

**B. Role-permissions patch** (assigns permissions to roles):
```powershell
docker exec -i hdsp_postgres psql -U hdsp_app -d hdsp_db < src\database\seeds\patch-role-permissions.sql
```

**C. Card thresholds patch** (fixes tier spend ranges per SRS):
```powershell
docker exec -i hdsp_postgres psql -U hdsp_app -d hdsp_db < src\database\seeds\patch-card-thresholds.sql
```

> **Important:** Run the seed only ONCE. Running it again on an existing database will
> cause duplicate key errors. The patches use `ON CONFLICT DO NOTHING` so they are safe to re-run.

---

### Step 14 — Copy RSA Public Key for HDSP Backend

```powershell
# Make sure the keys folder exists in backend
mkdir D:\HDSP\backend\keys
copy D:\HDSP\keys\license-public.pem D:\HDSP\backend\keys\license-public.pem
```

---

## PART 7 — Start All Applications

Open 4 separate PowerShell windows, one for each service.

### Window 1 — HDSP Backend

```powershell
cd D:\HDSP\backend
npm run start:dev
```

Wait until you see:
```
[Nest] LOG [NestApplication] Nest application successfully started
```

Verify it works: open browser → `http://localhost:3001/api/v1/license/status`
You should see JSON with `"isTrial": true`.

---

### Window 2 — HDSP Frontend

```powershell
cd D:\HDSP\frontend
npm run dev
```

Wait until you see:
```
✓ Ready in Xs
```

Open browser → `http://localhost:3000` → login page should appear.

**Default superadmin credentials** (set during seed):
- Username: `superadmin`
- Password: `Admin@123` (or whatever the seed set — check `seed-platform.ts`)

---

### Window 3 — Vendor Portal Backend

```powershell
cd D:\HDSP\vendor-portal\backend
npm run start:dev
```

Wait until you see the Nest startup message. The vendor DB schema will be created automatically
(synchronize: true in development mode).

Verify: `http://localhost:4000/api/docs` — Swagger UI should appear.

---

### Window 4 — Vendor Portal Frontend

```powershell
cd D:\HDSP\vendor-portal\frontend
npm run dev
```

Open browser → `http://localhost:4001`
Login with:
- Username: `admin`
- Password: whatever you set in `DEFAULT_ADMIN_PASSWORD`

---

## PART 8 — Connect HDSP to Vendor Portal

### Step 15 — Register HDSP with Vendor Portal

1. Open `http://localhost:3000` → login as superadmin
2. Go to **Settings → License**
3. Click **Register with Vendor**
4. Fill in:
   - Vendor Platform URL: `http://localhost:4000`
   - This Server's Public IP: `127.0.0.1` (for local testing) or the actual office LAN IP
   - HDSP Backend Port: `3001`
5. Click **Register**

You should see a success message. The hospital will now appear in the vendor portal under **Hospitals**.

---

### Step 16 — Request a License

1. Still on Settings → License, click **Request License**
2. Select the modules you need (e.g. Patient Loyalty)
3. Add remarks and click **Submit Request**
4. Switch to `http://localhost:4001` (Vendor Portal)
5. Go to **Requests** → your request appears
6. Click the request → review details → click **Approve & Send License**
7. Select `MODULE_LICENSE`, tick the modules, set expiry date, click Approve
8. Switch back to HDSP → Settings → License → the license should now show as **Active**
   with the approved modules enabled

---

## PART 9 — Verify Patient Data Access

### Step 17 — Test Oracle HIS Connection

In the HDSP app:
1. Go to any patient search page
2. Search for a patient MRN
3. If you get results → Oracle is connected correctly
4. If you get an error → check the Oracle settings in `.env` with hospital IT

Common Oracle issues:
- **TNS error** → `ORACLE_SERVICE` name is wrong — ask IT for the exact service name
- **ORA-01017** → wrong username/password
- **Connection timeout** → office PC may need to be on the hospital's internal network or VPN
- **Thick mode error** → Instant Client not in PATH — restart PowerShell after updating PATH

---

## PART 10 — Running Permanently (Production Mode)

For production use (not development), use PM2 instead of `npm run dev`.

### Install PM2

```powershell
npm install -g pm2
pm2 install pm2-windows-startup
pm2-startup install
```

### Start everything with PM2

```powershell
# HDSP Backend
cd D:\HDSP\backend
npm run build
pm2 start dist/main.js --name hdsp-backend

# HDSP Frontend
cd D:\HDSP\frontend
npm run build
pm2 start "npm run start" --name hdsp-frontend

# Vendor Portal Backend
cd D:\HDSP\vendor-portal\backend
npm run build
pm2 start dist/main.js --name vendor-backend

# Vendor Portal Frontend
cd D:\HDSP\vendor-portal\frontend
npm run build
pm2 start "npm run start" --name vendor-frontend

# Save so they restart on Windows reboot
pm2 save
```

Check everything is running:
```powershell
pm2 status
```

All 4 services should show **online** in green.

To view logs for any service:
```powershell
pm2 logs hdsp-backend
pm2 logs vendor-backend
```

---

## Quick Reference — Daily Start/Stop

If the office PC was restarted and Docker containers stopped:

```powershell
# Start databases first
cd D:\HDSP\infrastructure && docker compose up -d
cd D:\HDSP\vendor-portal  && docker compose up -d vendor_postgres

# Then start apps (if using PM2)
pm2 start all

# Or restart all at once
pm2 restart all
```

To stop everything cleanly:
```powershell
pm2 stop all
docker stop hdsp_postgres hdsp_redis vendor_postgres
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot connect to database` | Run `docker ps` — postgres containers must be Up |
| `Migration failed` | Check `.env` DB_PASSWORD matches docker-compose password |
| `License not activating` | Confirm `license-public.pem` is at `backend/keys/license-public.pem` |
| `Oracle connection refused` | Check VPN/network — office PC must reach HIS server IP |
| `Port already in use` | Another app is on that port — run `netstat -ano \| findstr :3001` to find it |
| `Webhook not received` | Firewall may be blocking port 3001 — add Windows Defender inbound rule for it |
| `Vendor portal can't reach HDSP` | Use the office PC's LAN IP (e.g. `192.168.x.x`) instead of `localhost` in registration |
| `node_modules errors` | Delete the `node_modules` folder and run `npm install` again |
| `pm2 not found` | Run `npm install -g pm2` again — Node PATH may not be set for all users |

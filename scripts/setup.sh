#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HDSP Setup Script — Phase 0 Environment Bootstrap
# Run on a fresh Ubuntu 22.04 server as root or with sudo
#
# Usage: sudo bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()  { echo -e "${GREEN}[HDSP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

HDSP_USER="hdsp"
HDSP_DIR="/opt/hdsp"
NODE_VERSION="20"

log "Starting HDSP Environment Setup..."

# ── System Update ────────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ── Create HDSP system user ──────────────────────────────────────────────────
if ! id "$HDSP_USER" &>/dev/null; then
  log "Creating system user: $HDSP_USER"
  useradd --system --create-home --shell /bin/bash "$HDSP_USER"
fi

# ── Node.js via NVM ──────────────────────────────────────────────────────────
log "Installing Node.js $NODE_VERSION LTS..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
node --version; npm --version

# ── PM2 ─────────────────────────────────────────────────────────────────────
log "Installing PM2..."
npm install -g pm2

# ── Nginx ────────────────────────────────────────────────────────────────────
log "Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── PostgreSQL 15 ────────────────────────────────────────────────────────────
log "Installing PostgreSQL 15..."
apt-get install -y postgresql-15 postgresql-client-15
systemctl enable postgresql

# ── Redis 7 ─────────────────────────────────────────────────────────────────
log "Installing Redis 7..."
apt-get install -y redis-server
systemctl enable redis-server

# ── Oracle Instant Client (Thick mode) ──────────────────────────────────────
warn "Oracle Instant Client must be installed manually."
warn "Download from: https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html"
warn "Install to: /opt/oracle/instantclient"
warn "Then run: sudo ldconfig"

# ── Directory Structure ───────────────────────────────────────────────────────
log "Creating HDSP directory structure..."
mkdir -p $HDSP_DIR/{backend,frontend,logs/{pm2,combined,errors},keys,backups}
chown -R $HDSP_USER:$HDSP_USER $HDSP_DIR
chmod 750 $HDSP_DIR/keys  # Restrict key directory

# ── SSL Self-Signed Certificate (development / internal) ────────────────────
log "Generating self-signed SSL certificate..."
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/hdsp.key \
  -out    /etc/nginx/ssl/hdsp.crt \
  -subj   "/C=IN/ST=State/L=City/O=Hospital/CN=hdsp.hospital.local" \
  2>/dev/null
chmod 600 /etc/nginx/ssl/hdsp.key

# ── Nginx Configuration ──────────────────────────────────────────────────────
log "Configuring Nginx..."
cp "$(dirname "$0")/../infrastructure/nginx/nginx.conf" /etc/nginx/nginx.conf
cp "$(dirname "$0")/../infrastructure/nginx/hdsp.conf"  /etc/nginx/conf.d/hdsp.conf
nginx -t && systemctl reload nginx

# ── PostgreSQL Setup ─────────────────────────────────────────────────────────
log "Setting up PostgreSQL database and user..."
sudo -u postgres psql <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hdsp_app') THEN
    CREATE ROLE hdsp_app WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
  END IF;
END
\$\$;
CREATE DATABASE hdsp_db OWNER hdsp_app;
GRANT ALL PRIVILEGES ON DATABASE hdsp_db TO hdsp_app;
EOF

# ── Redis Hardening ──────────────────────────────────────────────────────────
log "Hardening Redis configuration..."
REDIS_CONF="/etc/redis/redis.conf"
sed -i 's/^bind .*/bind 127.0.0.1/'              "$REDIS_CONF"
sed -i 's/^# requirepass .*/requirepass CHANGE_ME_REDIS_PASSWORD/' "$REDIS_CONF"
sed -i 's/^protected-mode no/protected-mode yes/' "$REDIS_CONF"
systemctl restart redis-server

# ── Firewall ─────────────────────────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp   # HTTP (redirects to HTTPS)
ufw allow 443/tcp  # HTTPS

# ── PM2 Startup ─────────────────────────────────────────────────────────────
log "Configuring PM2 startup..."
pm2 startup systemd -u $HDSP_USER --hp /home/$HDSP_USER

log "────────────────────────────────────────────────────────"
log "Phase 0 Environment Setup COMPLETE"
log ""
log "Next steps:"
log "  1. Copy .env.example to backend/.env and fill ALL values"
log "  2. Install Oracle Instant Client at /opt/oracle/instantclient"
log "  3. cd backend && npm ci && npm run migration:run && npm run seed"
log "  4. cd frontend && npm ci && npm run build"
log "  5. pm2 start /opt/hdsp/infrastructure/pm2/ecosystem.config.js"
log "  6. pm2 save"
log "  7. Verify health: curl -k https://localhost/api/health"
log "────────────────────────────────────────────────────────"

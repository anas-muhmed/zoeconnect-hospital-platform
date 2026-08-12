/**
 * PM2 Ecosystem Configuration — HDSP Production
 *
 * Usage:
 *   pm2 start ecosystem.config.js              # Start all apps
 *   pm2 reload ecosystem.config.js             # Zero-downtime reload
 *   pm2 stop ecosystem.config.js               # Stop all
 *   pm2 delete ecosystem.config.js             # Remove from PM2
 *   pm2 save                                   # Persist after reboot
 *   pm2 startup                                # Generate startup script
 *   pm2 logs hdsp-backend                      # Live logs
 *   pm2 monit                                  # Live CPU/memory monitor
 */
module.exports = {
  apps: [
    // ── NestJS Backend ──────────────────────────────────────────────────────
    {
      name: 'hdsp-backend',
      script: './dist/main.js',
      cwd: '/opt/hdsp/backend',
      instances: 2,                      // Cluster: 2 workers; use 'max' for all CPUs
      exec_mode: 'cluster',
      watch: false,                      // NEVER true in production
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Log configuration
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: '/opt/hdsp/logs/pm2/backend-error.log',
      out_file: '/opt/hdsp/logs/pm2/backend-out.log',
      merge_logs: true,
      // Restart strategy
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Health monitoring
      exp_backoff_restart_delay: 100,
    },

    // ── Next.js Frontend ────────────────────────────────────────────────────
    {
      name: 'hdsp-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/opt/hdsp/frontend',
      instances: 1,                      // Next.js manages its own clustering
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_TELEMETRY_DISABLED: 1,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: '/opt/hdsp/logs/pm2/frontend-error.log',
      out_file: '/opt/hdsp/logs/pm2/frontend-out.log',
      merge_logs: true,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],

  // ── Deploy configuration (optional — for remote deployments) ──────────────
  deploy: {
    production: {
      user: 'hdsp',
      host: ['production-server'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/hdsp.git',
      path: '/opt/hdsp',
      'pre-deploy-local': '',
      'post-deploy': [
        'cd backend && npm ci --omit=dev && npm run build && npm run migration:run',
        'cd frontend && npm ci --omit=dev && npm run build',
        'pm2 reload ecosystem.config.js --update-env',
      ].join(' && '),
      'pre-setup': 'apt-get install -y git nodejs npm',
    },
  },
};

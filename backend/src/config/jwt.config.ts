import { registerAs } from '@nestjs/config';

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  // ZoeConnect Connector auth (2026-07-21, HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md
  // Phase A). Deliberately SEPARATE secrets from user access/refresh
  // tokens above -- a connector token must never be able to validate
  // against JwtAuthGuard/JwtStrategy (user routes) even by accident, and
  // vice versa. Falls back to the user secrets only if unset, so a
  // deployment that hasn't set these new env vars yet doesn't silently
  // fail to boot -- but every real deployment should set distinct values.
  connectorSecret: process.env.JWT_CONNECTOR_SECRET || process.env.JWT_SECRET,
  connectorExpiresIn: process.env.JWT_CONNECTOR_EXPIRES_IN || '15m',
  connectorRefreshSecret: process.env.JWT_CONNECTOR_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET,
  connectorRefreshExpiresIn: process.env.JWT_CONNECTOR_REFRESH_EXPIRES_IN || '30d',
  // ZoeConnect Kiosk Desktop auth (kiosk-desktop/, Electron till registration +
  // heartbeat). Same rationale as the Connector secrets above: a kiosk
  // token must never validate against the user JwtAuthGuard, or against
  // the Connector's own guard/gateway, so it gets its own secret pair
  // rather than reusing connectorSecret.
  kioskSecret: process.env.JWT_KIOSK_SECRET || process.env.JWT_SECRET,
  kioskExpiresIn: process.env.JWT_KIOSK_EXPIRES_IN || '15m',
  kioskRefreshSecret: process.env.JWT_KIOSK_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET,
  kioskRefreshExpiresIn: process.env.JWT_KIOSK_REFRESH_EXPIRES_IN || '90d',
}));

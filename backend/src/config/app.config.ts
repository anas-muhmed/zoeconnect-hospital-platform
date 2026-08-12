import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  apiVersion: process.env.API_VERSION || 'v1',
  appName: process.env.APP_NAME || 'ZoeConnect',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  // Phase 8 (Task 8.7): the base domain tenant subdomains are served under
  // in cloud mode (e.g. "hdsp.example.com" for "apollo.hdsp.example.com").
  // Only read/required when deployment.mode === 'cloud' -- see main.ts's
  // CORS setup and SubdomainTenantMiddleware (Task 8.2), which already
  // resolves the subdomain label independently of this value.
  cloudBaseDomain: process.env.CLOUD_BASE_DOMAIN || '',
  // ZoeConnect Identity Architecture Migration, Phase 6: subdomains are no
  // longer part of the platform's login architecture. Every organization
  // (cloud-provisioned or otherwise) is given this single shared login URL
  // instead of a subdomain-derived one -- see
  // TenantProvisioningService.buildProvisioningSummary(). Kept configurable
  // (rather than hardcoded) purely for staging/non-prod environments; there
  // is no per-tenant variant of this value.
  publicLoginUrl: process.env.PUBLIC_LOGIN_URL || 'https://zoeconnect.in/sign-in',
  // Phase 9 (Task 9.6): which role this process plays when the API and
  // worker are deployed as separate services (e.g. two ECS Fargate
  // services sharing one container image, distinguished only by this env
  // var and their command). Default 'all' is exactly today's self-hosted
  // PM2 behavior -- one process does everything (HTTP + cron + Bull
  // consumers) -- so self-hosted needs no change. 'api' starts the HTTP
  // listener but skips cron registration; 'worker' registers cron but
  // never starts the HTTP listener (so an ECS worker service is never
  // wired to the ALB target group in the first place). See main.ts and
  // app.module.ts for where this is read.
  processRole: (process.env.PROCESS_ROLE as 'all' | 'api' | 'worker') || 'all',
  // Phase 9 (Task 9.7): forces Winston's console transport on regardless
  // of NODE_ENV. logger.util.ts disables console output in production by
  // default (correct for PM2/self-hosted, which already tails PM2's own
  // out_file/error_file, and would otherwise double-log) -- but in an ECS
  // Fargate container, CloudWatch Logs' awslogs driver captures stdout/
  // stderr, not files written to the container's ephemeral filesystem, so
  // container deployments must opt into console output explicitly here.
  logToStdout: process.env.LOG_TO_STDOUT === 'true',
}));

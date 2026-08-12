/**
 * Self-hosted installer entrypoint (Phase 12, Task 12.4).
 *
 * Run once, after migrations, on a fresh self-hosted install:
 *   npm run provision:self-hosted
 * (invoked automatically by install.sh -- see infrastructure/installer/).
 *
 * Idempotent: if any non-system Tenant already exists, this exits 0
 * immediately without doing anything -- safe to re-run install.sh (e.g. on
 * a version upgrade) without re-provisioning or erroring.
 *
 * Boots a NestJS *application context* (`NestFactory.createApplicationContext`),
 * not a full HTTP server -- gets real DI-wired services (`TenantProvisioningService`,
 * `AuthService`, TypeORM repositories, etc.) exactly as the running app would
 * construct them, without binding a port or registering routes. This is
 * intentionally NOT a reimplementation of the provisioning logic in raw SQL
 * (unlike `seed-platform.ts`, which predates this phase and works directly
 * against `AppDataSource`) -- reusing the real service means self-hosted and
 * cloud provisioning can never silently drift apart.
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { Tenant } from '../modules/platform/tenant/entities/tenant.entity';
import { TenantProvisioningService } from '../modules/platform/tenant-provisioning/tenant-provisioning.service';
import { PgToolsService } from '../modules/backup/services/pg-tools.service';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith('CHANGE_ME')) {
    throw new Error(`${name} is not set (or still contains the template's CHANGE_ME placeholder) -- edit .env before running the installer`);
  }
  return value;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });

  try {
    // Best-effort PostgreSQL client-tools (pg_dump/pg_restore) auto-detect,
    // run once here rather than in the CreateBackupToolSettings migration --
    // this script is the real self-hosted first-run bootstrap hook (it
    // already boots a full DI-wired NestJS application context after
    // migrations have applied, exactly like every other piece of real
    // provisioning logic below), so it's a cleaner integration point than
    // teaching a migration to reach into application services. Wrapped in
    // try/catch so a detection failure (nothing found, unreadable
    // directory, anything) never fails the install -- the admin can always
    // run detection again later from Backup -> Settings -> Database Tools,
    // or type a path in directly. This only populates the CACHED
    // detected_* columns (resolution order step 2); it never touches the
    // admin-configured pg_dump_path/pg_restore_path columns.
    try {
      const pgToolsService = app.get(PgToolsService);
      const detected = await pgToolsService.detectInstallations();
      if (detected.pgDumpPath && detected.pgRestorePath) {
        console.log(`Detected PostgreSQL client tools: pg_dump=${detected.pgDumpPath}, pg_restore=${detected.pgRestorePath}, version=${detected.version ?? 'unknown'}`);
      } else {
        console.log('No PostgreSQL client tools (pg_dump/pg_restore) auto-detected at common install locations -- configure them from Backup -> Settings -> Database Tools after setup, or ensure they are on PATH.');
      }
    } catch (err) {
      console.warn(`PostgreSQL client-tools auto-detection failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }

    const tenantRepo = app.get<Repository<Tenant>>(getRepositoryToken(Tenant));
    const existing = await tenantRepo.count({ where: { isSystem: false } });
    if (existing > 0) {
      console.log('A tenant already exists -- self-hosted install already provisioned. Nothing to do.');
      return;
    }

    const provisioningService = app.get(TenantProvisioningService);

    const hospitalName = requireEnv('INITIAL_HOSPITAL_NAME');
    const adminUsername = requireEnv('INITIAL_ADMIN_USERNAME');
    const adminEmail = requireEnv('INITIAL_ADMIN_EMAIL');
    const adminPassword = requireEnv('INITIAL_ADMIN_PASSWORD');

    console.log(`Provisioning self-hosted tenant "${hospitalName}"...`);

    const run = await provisioningService.provision(
      {
        hospitalName,
        // Placeholder only -- Step 1 discards this for self-hosted mode
        // (leaves Tenant.subdomain null) and Step 2 is skipped entirely.
        // See tenant-provisioning.service.ts's mode-aware step comments.
        subdomain: 'self-hosted',
        adminUsername,
        adminEmail,
        adminPassword,
        triggeredBy: 'installer:provision-self-hosted',
      },
      'self_hosted',
    );

    if (run.status !== 'completed') {
      console.error(`Provisioning did not complete successfully. Status: ${run.status}. Error: ${run.error ?? 'unknown'}`);
      console.error('The stack will still start (migrations already applied), but no admin user was created -- re-run this script after investigating, or use the admin API once the app is up.');
      process.exitCode = 1;
      return;
    }

    console.log(`Self-hosted install provisioned successfully. Tenant: ${run.tenantId}. Admin username: ${adminUsername}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('provision-self-hosted failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

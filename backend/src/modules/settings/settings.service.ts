import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SystemSetting } from './entities/system-setting.entity';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';

/**
 * Fix (2026-07-20, real production incident): `getSettings()` used to read
 * every row in `system_settings` with no tenant filter at all, and
 * `setting_key` carried a GLOBAL unique constraint -- so there could only
 * ever be one row for e.g. "security.idleTimeoutMinutes" in the whole
 * database, shared by every tenant. A short idle timeout configured by one
 * tenant (for their own testing) silently applied to every other tenant's
 * sessions too -- surfaced as MOSC's users being logged out for no reason
 * they could see or control from their own Settings screen.
 *
 * Both public methods now resolve `tenantId` the same way
 * `LicenseService.resolveLicenseCacheTenantKey()` does: explicit override
 * param (for callers with no ambient context to thread through, e.g.
 * AuthService's @Public() refresh/activity endpoints) -> ambient
 * `TenantContextStorage` (established by `TenantContextInterceptor` for
 * every JWT-authenticated controller that already opts into it, or by an
 * explicit `TenantContextStorage.run()` wrapping a verified webhook
 * handler) -> `null` (defensive last resort; should not occur for any real
 * request going forward).
 *
 * Self-hosted: every existing row was backfilled to the single seeded
 * 'default' tenant (see PerTenantSystemSettings migration, 1785600000000),
 * and every real request there resolves to that same tenant one way or
 * another -- byte-identical behavior to before this fix.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepo: Repository<SystemSetting>,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  private async resolveTenantId(explicitTenantId?: string | null): Promise<string | null> {
    if (explicitTenantId) return explicitTenantId;
    return this.tenantContext.currentTenantIdOrNull();
  }

  async applyWebhookUpdate(settings: Record<string, string>, explicitTenantId?: string | null): Promise<void> {
    const keys = Object.keys(settings);
    if (keys.length === 0) return;

    const tenantId = await this.resolveTenantId(explicitTenantId);

    for (const key of keys) {
      await this.settingsRepo.upsert(
        { settingKey: key, settingValue: settings[key], tenantId },
        ['settingKey', 'tenantId'],
      );
    }
    this.logger.log(`Upserted ${keys.length} system settings from vendor push (tenant=${tenantId ?? 'unresolved'})`);
  }

  async getSettings(explicitTenantId?: string | null): Promise<Record<string, string>> {
    const tenantId = await this.resolveTenantId(explicitTenantId);
    const rows = await this.settingsRepo.find({
      where: { tenantId: tenantId ?? IsNull() },
    });
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.settingKey] = r.settingValue;
    }
    return result;
  }
}

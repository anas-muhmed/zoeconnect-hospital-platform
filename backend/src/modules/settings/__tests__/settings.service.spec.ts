import { SettingsService } from '../settings.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

// ── Fix verification (real incident, 2026-07-20): getSettings() used to
// read every row in system_settings with no tenant filter at all, and
// setting_key carried a GLOBAL unique constraint -- one tenant's idle
// timeout (or any other setting) silently applied to every other tenant.
// These tests exercise the real TenantContextStorage (not mocked) to
// confirm getSettings()/applyWebhookUpdate() now resolve tenant correctly
// via explicit override -> ambient context -> null, and that two tenants'
// settings are genuinely isolated. ──

function matches(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && '_type' in v && v._type === 'is-null') {
      return row[k] === null || row[k] === undefined;
    }
    return row[k] === v;
  });
}

function createInMemoryRepo(rows: any[] = []) {
  let seq = 0;
  return {
    _rows: rows,
    find: jest.fn(async (options?: any) => rows.filter((r) => matches(r, options?.where))),
    create: jest.fn((partial: any) => ({ id: `id-${++seq}`, ...partial })),
    upsert: jest.fn(async (entityLike: any, conflictPaths: string[]) => {
      const existing = rows.find((r) => conflictPaths.every((p) => r[p] === entityLike[p]));
      if (existing) {
        Object.assign(existing, entityLike);
      } else {
        rows.push({ id: `id-${++seq}`, ...entityLike });
      }
    }),
  };
}

function createService(rows: any[] = []) {
  const settingsRepo = createInMemoryRepo(rows);
  const tenantContext = new TenantContextStorage();
  const service = new SettingsService(settingsRepo as any, tenantContext);
  return { service, settingsRepo, tenantContext };
}

describe('SettingsService tenant isolation (cross-tenant leak fix)', () => {
  describe('getSettings', () => {
    it('returns only the explicitly-given tenant\'s settings, not another tenant\'s', async () => {
      const rows = [
        { id: 'r1', settingKey: 'security.idleTimeoutMinutes', settingValue: '1', tenantId: 'tenant-a' },
        { id: 'r2', settingKey: 'security.idleTimeoutMinutes', settingValue: '60', tenantId: 'tenant-b' },
      ];
      const { service } = createService(rows);

      const settingsA = await service.getSettings('tenant-a');
      const settingsB = await service.getSettings('tenant-b');

      expect(settingsA['security.idleTimeoutMinutes']).toBe('1');
      expect(settingsB['security.idleTimeoutMinutes']).toBe('60');
    });

    it('resolves tenant from ambient TenantContextStorage when no explicit override is given', async () => {
      const rows = [
        { id: 'r1', settingKey: 'security.idleTimeoutMinutes', settingValue: '1', tenantId: 'tenant-a' },
        { id: 'r2', settingKey: 'security.idleTimeoutMinutes', settingValue: '60', tenantId: 'tenant-b' },
      ];
      const { service, tenantContext } = createService(rows);

      const seenByA = await TenantContextStorage.run('tenant-a', () => service.getSettings());
      const seenByB = await TenantContextStorage.run('tenant-b', () => service.getSettings());

      expect(seenByA['security.idleTimeoutMinutes']).toBe('1');
      expect(seenByB['security.idleTimeoutMinutes']).toBe('60');
    });

    it('a tenant with no settings rows of its own gets an empty object, not another tenant\'s data', async () => {
      const rows = [
        { id: 'r1', settingKey: 'security.idleTimeoutMinutes', settingValue: '1', tenantId: 'tenant-a' },
      ];
      const { service } = createService(rows);

      const settings = await service.getSettings('tenant-fresh-cloud-tenant');

      expect(settings).toEqual({});
    });
  });

  describe('applyWebhookUpdate', () => {
    it('writes scoped to the explicitly-given tenant, leaving other tenants\' rows untouched', async () => {
      const rows = [
        { id: 'r1', settingKey: 'security.idleTimeoutMinutes', settingValue: '60', tenantId: 'tenant-b' },
      ];
      const { service, settingsRepo } = createService(rows);

      await service.applyWebhookUpdate({ 'security.idleTimeoutMinutes': '5' }, 'tenant-a');

      expect(settingsRepo._rows.find((r: any) => r.tenantId === 'tenant-a')?.settingValue).toBe('5');
      expect(settingsRepo._rows.find((r: any) => r.tenantId === 'tenant-b')?.settingValue).toBe('60');
    });

    it('updates only the matching tenant\'s existing row on a second call (upsert), not creating a duplicate', async () => {
      const { service, settingsRepo } = createService();

      await service.applyWebhookUpdate({ 'security.idleTimeoutMinutes': '5' }, 'tenant-a');
      await service.applyWebhookUpdate({ 'security.idleTimeoutMinutes': '10' }, 'tenant-a');

      const tenantARows = settingsRepo._rows.filter((r: any) => r.tenantId === 'tenant-a');
      expect(tenantARows).toHaveLength(1);
      expect(tenantARows[0].settingValue).toBe('10');
    });

    it('is a no-op for an empty settings object', async () => {
      const { service, settingsRepo } = createService();
      await service.applyWebhookUpdate({}, 'tenant-a');
      expect(settingsRepo.upsert).not.toHaveBeenCalled();
    });
  });
});

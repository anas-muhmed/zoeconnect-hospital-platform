import { PluginCompatibilityService } from '../plugin/plugin-compatibility';
import type { FormBuilderPlugin } from '../plugin/plugin.types';

function makePlugin(sdkVersion: string): FormBuilderPlugin {
  return { id: 'test-plugin', displayName: 'Test Plugin', version: '1.0.0', sdkVersion };
}

describe('PluginCompatibilityService (ADR-006)', () => {
  it('accepts a plugin whose range is satisfied by the current SDK version', () => {
    const svc = new PluginCompatibilityService('1.2.0');
    expect(svc.check(makePlugin('^1.0.0')).status).toBe('compatible');
  });

  it('rejects a plugin requiring a newer major SDK version', () => {
    const svc = new PluginCompatibilityService('1.0.0');
    const result = svc.check(makePlugin('^2.0.0'));
    expect(result.status).toBe('incompatible');
    expect(result.reason).toMatch(/requires SDK/);
  });

  it('flags a missing sdkVersion as unknown, not silently compatible', () => {
    const svc = new PluginCompatibilityService('1.0.0');
    const plugin = { ...makePlugin(''), sdkVersion: undefined as unknown as string };
    expect(svc.check(plugin).status).toBe('unknown');
  });

  it('flags an invalid semver range as unknown', () => {
    const svc = new PluginCompatibilityService('1.0.0');
    expect(svc.check(makePlugin('not-a-range')).status).toBe('unknown');
  });
});

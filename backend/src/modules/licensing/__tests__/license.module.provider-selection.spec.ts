/**
 * Cloud Licensing API (2026-07-29) -- LICENSE_PROVIDER binding is now
 * derived from `deployment.mode` ('cloud' -> SubscriptionLicenseProvider,
 * anything else -> FileLicenseProvider), with LICENSE_PROVIDER_MODE kept
 * only as an explicit escape-hatch override. See licenseProviderFactory()'s
 * doc comment in license.module.ts for the full rationale.
 */
import { ConfigService } from '@nestjs/config';
import { licenseProviderFactory } from '../license.module';
import { FileLicenseProvider } from '../providers/file-license.provider';
import { SubscriptionLicenseProvider } from '../providers/subscription-license.provider';

function makeConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, def?: unknown) => (key in values ? values[key] : def)),
  } as unknown as ConfigService;
}

describe('licenseProviderFactory (LICENSE_PROVIDER binding)', () => {
  const file = { marker: 'file' } as unknown as FileLicenseProvider;
  const subscription = { marker: 'subscription' } as unknown as SubscriptionLicenseProvider;

  it('deployment.mode=self_hosted, no override -> FileLicenseProvider', () => {
    const config = makeConfig({ 'deployment.mode': 'self_hosted' });
    expect(licenseProviderFactory(config, file, subscription)).toBe(file);
  });

  it('deployment.mode unset (default self_hosted), no override -> FileLicenseProvider', () => {
    const config = makeConfig({});
    expect(licenseProviderFactory(config, file, subscription)).toBe(file);
  });

  it('deployment.mode=cloud, no override -> SubscriptionLicenseProvider', () => {
    const config = makeConfig({ 'deployment.mode': 'cloud' });
    expect(licenseProviderFactory(config, file, subscription)).toBe(subscription);
  });

  it('deployment.mode=cloud BUT LICENSE_PROVIDER_MODE=file explicitly set -> escape hatch wins, FileLicenseProvider', () => {
    const config = makeConfig({ 'deployment.mode': 'cloud', LICENSE_PROVIDER_MODE: 'file' });
    expect(licenseProviderFactory(config, file, subscription)).toBe(file);
  });

  it('deployment.mode=self_hosted BUT LICENSE_PROVIDER_MODE=subscription explicitly set -> escape hatch wins, SubscriptionLicenseProvider', () => {
    const config = makeConfig({ 'deployment.mode': 'self_hosted', LICENSE_PROVIDER_MODE: 'subscription' });
    expect(licenseProviderFactory(config, file, subscription)).toBe(subscription);
  });
});

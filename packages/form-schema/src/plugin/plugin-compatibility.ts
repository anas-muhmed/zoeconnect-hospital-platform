import * as semver from 'semver';
import { CURRENT_SDK_VERSION, type FormBuilderPlugin, type CompatibilityResult } from './plugin.types';

/**
 * PluginCompatibilityService — checks a plugin's declared sdkVersion range against
 * the platform's current SDK version before activation (ADR-006). An incompatible
 * plugin must fail loudly and specifically, never partially load or silently
 * corrupt the Component Registry.
 */
export class PluginCompatibilityService {
  constructor(private readonly currentSdkVersion: string = CURRENT_SDK_VERSION) {}

  check(plugin: FormBuilderPlugin): CompatibilityResult {
    if (!plugin.sdkVersion) {
      return { status: 'unknown', reason: `Plugin "${plugin.id}" does not declare an sdkVersion.` };
    }
    if (!semver.validRange(plugin.sdkVersion)) {
      return {
        status: 'unknown',
        reason: `Plugin "${plugin.id}" declares an invalid sdkVersion range: "${plugin.sdkVersion}".`,
      };
    }
    const compatible = semver.satisfies(this.currentSdkVersion, plugin.sdkVersion);
    if (!compatible) {
      return {
        status: 'incompatible',
        reason: `Plugin "${plugin.id}" requires SDK ${plugin.sdkVersion}, but the platform is on SDK ${this.currentSdkVersion}.`,
      };
    }
    return { status: 'compatible' };
  }
}

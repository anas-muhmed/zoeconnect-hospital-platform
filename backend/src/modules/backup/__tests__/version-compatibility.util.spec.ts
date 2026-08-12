import { compareVersions, parseVersion } from '../utils/version-compatibility.util';

describe('parseVersion', () => {
  it('parses a well-formed semver string', () => {
    expect(parseVersion('17.4.2')).toEqual({ major: 17, minor: 4, patch: 2 });
  });

  it('treats missing/malformed input as 0.0.0 rather than throwing', () => {
    expect(parseVersion(null)).toEqual({ major: 0, minor: 0, patch: 0 });
    expect(parseVersion(undefined)).toEqual({ major: 0, minor: 0, patch: 0 });
    expect(() => parseVersion('not-a-version')).not.toThrow();
  });
});

describe('compareVersions', () => {
  it('classifies identical major.minor as fully_compatible', () => {
    const result = compareVersions('17.4', '17.4');
    expect(result.compatibility).toBe('fully_compatible');
  });

  it('classifies identical major.minor with different patch as fully_compatible', () => {
    const result = compareVersions('17.4.1', '17.4.9');
    expect(result.compatibility).toBe('fully_compatible');
  });

  it('classifies same major, different minor as compatible_with_warning', () => {
    const result = compareVersions('17.2', '17.5');
    expect(result.compatibility).toBe('compatible_with_warning');
  });

  it('classifies different major as incompatible', () => {
    const result = compareVersions('16.2', '17.4');
    expect(result.compatibility).toBe('incompatible');
  });

  it('classifies a missing version as unknown rather than silently compatible', () => {
    expect(compareVersions(null, '17.4').compatibility).toBe('unknown');
    expect(compareVersions('17.4', null).compatibility).toBe('unknown');
    expect(compareVersions(null, null).compatibility).toBe('unknown');
  });
});

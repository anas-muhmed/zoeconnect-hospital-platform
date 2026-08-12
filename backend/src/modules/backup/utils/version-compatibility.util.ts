/**
 * Shared version-parsing/comparison helpers used by both RestoreService's
 * app-version compatibility gate (`RestoreService.checkVersionCompatibility`,
 * 'same'|'older'|'newer'|'incompatible' against a configured minimum) and the
 * new server/client PostgreSQL tool version-compatibility check surfaced in
 * diagnostics (point 5 of the "Database Backup Service" review) and restore
 * readiness (point 6). Extracted here so the parsing logic lives in exactly
 * one place rather than being duplicated between restore.service.ts and the
 * new diagnostics/restore-readiness code paths.
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/** "3.2.1" -> { major: 3, minor: 2, patch: 1 }. Missing/malformed input parses as 0.0.0 rather than throwing. */
export function parseVersion(v: string | null | undefined): ParsedVersion {
  const parts = String(v || '0.0.0').split('.').map((p) => parseInt(p, 10));
  return {
    major: Number.isFinite(parts[0]) ? parts[0] : 0,
    minor: Number.isFinite(parts[1]) ? parts[1] : 0,
    patch: Number.isFinite(parts[2]) ? parts[2] : 0,
  };
}

export type CompatibilityLevel = 'fully_compatible' | 'compatible_with_warning' | 'incompatible' | 'unknown';

export interface CompatibilityResult {
  compatibility: CompatibilityLevel;
  message: string;
}

/**
 * Server-vs-client (or backup-db-version-vs-current-db-version) compatibility
 * classification (point 5 of the review):
 *   - same major.minor           -> 'fully_compatible'
 *   - same major, different minor -> 'compatible_with_warning'
 *   - different major             -> 'incompatible'
 *   - either version unknown (null/empty) -> 'unknown' (never silently
 *     reported as compatible when we don't actually know).
 *
 * This is intentionally a DIFFERENT classification from
 * RestoreService.checkVersionCompatibility() ('same'/'older'/'newer'/
 * 'incompatible' against a configured minimum floor, used for the
 * application-version gate) -- that method answers "is this backup's app
 * version too old to restore at all", this one answers "are these two
 * PostgreSQL versions close enough to trust without a warning". Both share
 * the same underlying parseVersion() above so the two checks never drift on
 * how a version string is parsed.
 */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): CompatibilityResult {
  if (!a || !b) {
    return { compatibility: 'unknown', message: 'One or both versions could not be determined.' };
  }
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va.major !== vb.major) {
    return {
      compatibility: 'incompatible',
      message: `Major version mismatch (${a} vs ${b}) -- restores/dumps across major PostgreSQL versions are not guaranteed to work.`,
    };
  }
  if (va.minor !== vb.minor) {
    return {
      compatibility: 'compatible_with_warning',
      message: `Minor version mismatch (${a} vs ${b}) -- same major version, should work, but matching versions is recommended.`,
    };
  }
  return { compatibility: 'fully_compatible', message: `Versions match (${a} vs ${b}).` };
}

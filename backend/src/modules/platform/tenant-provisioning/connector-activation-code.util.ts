import * as crypto from 'crypto';

/**
 * connector-activation-code.util.ts (D.6, "Onboarding UX," 2026-07-22).
 *
 * Shared between `TenantProvisioningService` (generates a code, stores its
 * bcrypt hash on a `TenantConnectorPairing` row) and
 * `ConnectorRegistrationService` (normalizes whatever a hospital IT user
 * typed into the Connector's activation screen before comparing it against
 * a stored hash) -- one place defining "what an activation code looks
 * like," so generation and redemption can never silently drift apart.
 *
 * Design goals, in order: (1) typeable by a non-technical person without
 * transcription errors, (2) enough entropy that online guessing is
 * infeasible even without the mitigations layered on top of it (rate
 * limiting on `POST /connector/register`, single-use, a short expiry
 * window -- see `TenantProvisioningService`'s `ACTIVATION_CODE_TTL_MS`),
 * (3) safe to read aloud over a phone call to a support engineer, which is
 * why ambiguous characters (0/O, 1/I/L) are excluded and everything is
 * uppercase.
 *
 * Alphabet is 32 symbols (Crockford-base32-style, minus the ambiguous set
 * above); 12 symbols total (grouped 4-4-4 with dashes for readability)
 * gives 32^12 ≈ 1.15 x 10^18 possible codes (~60 bits of entropy) -- for
 * comparison, a strong password policy typically targets 40-60 bits, and
 * this is combined with single-use + a short TTL + IP rate limiting on top,
 * not relied on alone.
 */
const ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O/1/I/L
const GROUP_SIZE = 4;
const GROUP_COUNT = 3;

/** Generates a fresh, randomly-chosen activation code, e.g. "ABCD-EFGH-JKLM". */
export function generateActivationCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    let group = '';
    for (let i = 0; i < GROUP_SIZE; i++) {
      const idx = crypto.randomInt(0, ACTIVATION_CODE_ALPHABET.length);
      group += ACTIVATION_CODE_ALPHABET[idx];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/**
 * Normalizes a hospital IT user's typed input before it's hashed (at
 * generation time, trivially -- the generator's own output is already
 * normalized) or compared (at redemption time, where it matters: users
 * paste codes with stray whitespace, lowercase, or without the dashes).
 * Strips everything except the alphabet's own characters and uppercases
 * -- so "abcd efgh jklm", "ABCD-EFGH-JKLM", and "abcdefghjklm" all
 * normalize identically.
 */
export function normalizeActivationCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

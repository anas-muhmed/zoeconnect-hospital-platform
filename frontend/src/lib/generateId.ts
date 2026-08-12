/**
 * Opaque id generator, safe outside secure contexts.
 *
 * `crypto.randomUUID()` is only exposed by browsers in secure contexts
 * (HTTPS or localhost). Workstations/kiosks for this app are commonly
 * reached over plain HTTP via a LAN IP (e.g. http://192.168.1.73:3000),
 * where `window.crypto.randomUUID` is `undefined` and calling it throws
 * "crypto.randomUUID is not a function". `crypto.getRandomValues` has no
 * such restriction, so prefer that,, and fall back to Math.random as a last
 * resort. These ids are used as local correlation keys (workstation id,
 * reservation id), not security tokens, so the fallback is an acceptable
 * degradation.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last-resort fallback (non-crypto RNG) -- only reached if the Web Crypto
  // API is entirely unavailable.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

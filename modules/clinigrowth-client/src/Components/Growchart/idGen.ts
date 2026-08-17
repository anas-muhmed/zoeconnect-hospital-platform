/**
 * crypto.randomUUID() only exists in secure contexts (HTTPS or localhost).
 * Falls back to a non-cryptographic random id so the app still works when
 * accessed over plain HTTP on a LAN (e.g. a tester's device hitting the dev
 * server by IP address).
 */
export function generateId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

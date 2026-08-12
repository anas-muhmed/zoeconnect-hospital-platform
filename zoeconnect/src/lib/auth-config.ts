/**
 * Wiring for the real ZoeConnect application, not a separate mock backend.
 * API_BASE is proxied to the real backend via this site's own next.config.mjs
 * rewrite (see BACKEND_URL there), so calls stay same-origin from the browser's
 * point of view. APP_URL is where a successful sign-in redirects to.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Self-service sign-up (OTP + tenant provisioning) is served by the Vendor
 * Portal backend, not the main ZoeConnect backend — proxied same-origin via
 * this site's own next.config.mjs /vendor-api rewrite (see VENDOR_PORTAL_URL
 * there), same "browser only ever talks to this site's own origin" pattern
 * as API_BASE above.
 */
export const VENDOR_API_BASE = process.env.NEXT_PUBLIC_VENDOR_API_URL ?? "/vendor-api";

/**
 * Backend error messages (e.g. "Account locked until <ISO>Z...") embed a raw
 * UTC ISO timestamp, since the backend has no notion of the browser's
 * timezone. Reformat to the browser's local time before showing it — same
 * fix already applied in the real application's own login page.
 */
export function localizeIsoTimestamps(message: string): string {
  return message.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g,
    (iso) => {
      const d = new Date(iso);
      return isNaN(d.getTime())
        ? iso
        : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
  );
}

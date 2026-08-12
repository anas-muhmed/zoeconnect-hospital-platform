import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounce } from "./use-debounce";
import { VENDOR_API_BASE } from "@/lib/auth-config";

/**
 * CRITICAL FEATURE (production incident, 2026-08 -- "username availability
 * validation is inconsistent... sometimes doesn't display Available/Taken
 * until later"). INVESTIGATION FINDING: the premise of a flaky debounce/
 * cache/race bug didn't match the code -- zoeconnect/sign-up-form.tsx had
 * NO live-typing availability check implemented at all; the username field
 * was a bare `onChange`, and feedback only ever arrived after full form
 * submission (a real, but different, UX gap). This hook is the actual
 * missing feature, not a bugfix to an existing one.
 *
 * Modeled directly on frontend/src/lib/hooks/useFieldAvailability.ts (the
 * hospital app's own proven, reusable pattern for the exact same problem,
 * already built with multi-caller reuse in mind -- see that file's own doc
 * comment: "Organization Management, Tenant Management, Client Management,
 * Registration, and Vendor Portal forms are expected to call this exact
 * service"). Duplicated here (not imported) for the same reason
 * use-debounce.ts is -- zoeconnect is a separate deployable app with its
 * own dependency tree, no shared hooks package exists. Behavior is
 * intentionally identical:
 * - Debounced ~500ms after the user stops typing.
 * - Cancels/ignores stale requests via an incrementing request id + one
 *   shared AbortController, so rapid typing can never let an older,
 *   slower response overwrite a newer one (no race conditions).
 * - Exactly one call per settled value (no polling): the debounced effect
 *   only fires again when `debouncedValues` actually changes.
 * - Fails open (`idle`, never a false "taken") on a network/server error --
 *   the real submit-time check (`PublicSignupController.register()` ->
 *   ZoeConnect's own uniqueness constraint) remains authoritative; this is
 *   advisory UX, never a hard gate on its own.
 *
 * Calls `POST /vendor-api/public/signup/check-availability` -- the new
 * public, unauthenticated endpoint on the Vendor Portal backend
 * (public-signup.controller.ts) added alongside this hook, which itself
 * proxies to `CloudTenantsService.checkPublicAvailability()` ->
 * ZoeConnect's own `TenantProvisioningService.checkAvailability()` -- the
 * SAME single source of truth `provision()`'s real pre-flight check and
 * the Vendor Portal admin's own cloud-tenants page already use. No
 * duplicated availability logic anywhere in this chain.
 */

export type FieldAvailabilityStatus = "idle" | "checking" | "available" | "taken" | "invalid";

interface CheckAvailabilityApiResponse {
  fields: Record<string, { available: boolean; reason?: "already_exists" | "reserved" }>;
}

export interface UseFieldAvailabilityOptions {
  values: { adminUsername?: string; adminEmail?: string };
  debounceMs?: number;
  enabled?: boolean;
}

export interface UseFieldAvailabilityResult {
  status: Partial<Record<"adminUsername" | "adminEmail", FieldAvailabilityStatus>>;
  reason: Partial<Record<"adminUsername" | "adminEmail", "already_exists" | "reserved">>;
}

export function useFieldAvailability(options: UseFieldAvailabilityOptions): UseFieldAvailabilityResult {
  const { values, debounceMs = 500, enabled = true } = options;
  const debouncedValues = useDebounce(values, debounceMs);

  const [status, setStatus] = useState<UseFieldAvailabilityResult["status"]>({});
  const [reason, setReason] = useState<UseFieldAvailabilityResult["reason"]>({});

  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const runCheck = useCallback((vals: { adminUsername?: string; adminEmail?: string }) => {
    if (!enabled) return;

    const eligible = (["adminUsername", "adminEmail"] as const).filter((k) => !!vals[k]?.trim());

    setStatus((prev) => {
      const next = { ...prev };
      (["adminUsername", "adminEmail"] as const).forEach((k) => {
        if (!eligible.includes(k)) next[k] = vals[k] ? next[k] : "idle";
      });
      return next;
    });

    if (eligible.length === 0) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;

    setStatus((prev) => {
      const next = { ...prev };
      eligible.forEach((k) => { next[k] = "checking"; });
      return next;
    });

    const payload: Record<string, string> = {};
    eligible.forEach((k) => { payload[k] = vals[k]!.trim(); });

    fetch(`${VENDOR_API_BASE}/public/signup/check-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (requestId !== requestIdRef.current) return; // superseded by a newer request
        if (!res.ok) throw new Error(`check-availability returned ${res.status}`);
        const data = (await res.json()) as CheckAvailabilityApiResponse;
        setStatus((prev) => {
          const next = { ...prev };
          eligible.forEach((k) => {
            next[k] = data.fields[k]?.available === false ? "taken" : "available";
          });
          return next;
        });
        setReason((prev) => {
          const next = { ...prev };
          eligible.forEach((k) => { next[k] = data.fields[k]?.reason; });
          return next;
        });
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        const name = (err as { name?: string })?.name;
        if (name === "AbortError") return; // expected -- we cancelled it ourselves
        // Fail open: back to 'idle', never a false "taken". The real
        // submit-time check on the backend remains authoritative.
        setStatus((prev) => {
          const next = { ...prev };
          eligible.forEach((k) => { next[k] = "idle"; });
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const debouncedKey = JSON.stringify(debouncedValues);
  useEffect(() => {
    runCheck(debouncedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, enabled]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { status, reason };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from './useDebounce';
import type { AvailabilityReason, AvailabilityResponse } from '@/lib/validation/availability.types';

/**
 * Reusable "is this value already taken" hook, built on top of the
 * platform's shared `AvailabilityCheckService` backend infrastructure
 * (`common/validation/availability-check.service.ts`) and the existing
 * `useDebounce` hook.
 *
 * Not coupled to the Users form or any single endpoint — the caller
 * supplies `checkFn`, so Organization Management, Tenant Management,
 * Client Management, Registration, and Vendor Portal forms can all reuse
 * this hook against their own module's availability endpoint.
 *
 * Behaviour, matching the spec this was built against:
 * - Debounced ~400-600ms after the user stops typing (caller-configurable
 *   via `debounceMs`), plus an explicit `checkNow()` for on-blur checks.
 * - Never calls the backend for a field whose local format validation is
 *   currently failing (`validFormat[field] === false`) — callers pass their
 *   own (zod, or otherwise) format check in per keystroke.
 * - Cancels/ignores stale requests: every call gets an incrementing request
 *   id and an AbortController; a response is only applied if it's still the
 *   most recent in-flight request, so rapid typing can't let an older,
 *   slower response overwrite a newer one.
 */

export type FieldAvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export interface UseFieldAvailabilityOptions<K extends string> {
  /** Current raw field values, keyed by field name. */
  values: Partial<Record<K, string>>;
  /**
   * Per-field local format validity. A field is skipped entirely (backend
   * never called) when explicitly `false`. Omitted/undefined is treated as
   * "no local format rule to enforce" (still checked, as long as a value is
   * present).
   */
  validFormat?: Partial<Record<K, boolean>>;
  /** Calls the module's own availability endpoint for exactly the fields passed in. */
  checkFn: (values: Partial<Record<K, string>>, signal: AbortSignal) => Promise<AvailabilityResponse>;
  /** Debounce delay before the value-change-triggered check fires. Defaults to 500ms. */
  debounceMs?: number;
  /** Set false to suspend checks entirely (e.g. dialog closed). */
  enabled?: boolean;
}

export interface UseFieldAvailabilityResult<K extends string> {
  status: Partial<Record<K, FieldAvailabilityStatus>>;
  reason: Partial<Record<K, AvailabilityReason>>;
  isChecking: boolean;
  /** Force an immediate check with the current values, bypassing the debounce — wire to onBlur. */
  checkNow: () => void;
}

export function useFieldAvailability<K extends string>(
  options: UseFieldAvailabilityOptions<K>,
): UseFieldAvailabilityResult<K> {
  const { values, validFormat = {}, checkFn, debounceMs = 500, enabled = true } = options;
  const debouncedValues = useDebounce(values, debounceMs);

  const [status, setStatus] = useState<Partial<Record<K, FieldAvailabilityStatus>>>({});
  const [reason, setReason] = useState<Partial<Record<K, AvailabilityReason>>>({});
  const [isChecking, setIsChecking] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  // Keep the latest validFormat/checkFn without forcing runCheck to be
  // re-created (and re-triggering effects) on every render — callers
  // routinely pass a fresh inline function/object each render.
  const validFormatRef = useRef<Partial<Record<K, boolean>>>(validFormat);
  validFormatRef.current = validFormat;
  const checkFnRef = useRef<UseFieldAvailabilityOptions<K>['checkFn']>(checkFn);
  checkFnRef.current = checkFn;

  const runCheck = useCallback((vals: Partial<Record<K, string>>) => {
    if (!enabled) return;

    const eligible = (Object.keys(vals) as K[]).filter((k) => {
      const v = vals[k];
      return !!v && validFormatRef.current[k] !== false;
    });

    // Fields with no value, or currently failing local format validation,
    // are reported as 'idle'/'invalid' immediately — no network round trip.
    setStatus((prev) => {
      const next = { ...prev };
      (Object.keys(vals) as K[]).forEach((k) => {
        if (!eligible.includes(k)) {
          next[k] = vals[k] && validFormatRef.current[k] === false ? 'invalid' : (vals[k] ? next[k] : 'idle');
        }
      });
      return next;
    });

    if (eligible.length === 0) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;

    setIsChecking(true);
    setStatus((prev) => {
      const next = { ...prev };
      eligible.forEach((k) => { next[k] = 'checking'; });
      return next;
    });

    const payload: Partial<Record<K, string>> = {};
    eligible.forEach((k) => { payload[k] = vals[k]; });

    checkFnRef.current(payload, controller.signal)
      .then((res) => {
        if (requestId !== requestIdRef.current) return; // superseded by a newer request
        setStatus((prev) => {
          const next = { ...prev };
          eligible.forEach((k) => {
            next[k] = res.fields[k]?.available === false ? 'taken' : 'available';
          });
          return next;
        });
        setReason((prev) => {
          const next = { ...prev };
          eligible.forEach((k) => { next[k] = res.fields[k]?.reason; });
          return next;
        });
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        const name = (err as { name?: string })?.name;
        if (name === 'CanceledError' || name === 'AbortError') return; // expected — we cancelled it ourselves
        // Network/server error: fail open (back to 'idle') rather than
        // blocking the user with a false "already in use" — the backend's
        // real unique-constraint check at submit time is still authoritative.
        setStatus((prev) => {
          const next = { ...prev };
          eligible.forEach((k) => { next[k] = 'idle'; });
          return next;
        });
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsChecking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Debounced, value-change-triggered check.
  const debouncedKey = JSON.stringify(debouncedValues);
  useEffect(() => {
    runCheck(debouncedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, enabled]);

  // Abort any in-flight request on unmount.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const checkNow = useCallback(() => runCheck(values), [runCheck, values]);

  return { status, reason, isChecking, checkNow };
}

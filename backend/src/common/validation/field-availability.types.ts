/**
 * Shared contract for every "is this value already taken" check across the
 * platform — Users today, and (per the reusable design this module exists
 * for) Organization Management, Tenant Management, Client Management,
 * Registration, and Vendor Portal going forward.
 *
 * Kept deliberately small and string-keyed (`reason` is a plain union, the
 * response is a `Record<string, ...>` map) so a future validation rule
 * (reserved names, tenant-specific policy, blocked email domains, etc.) can
 * add a new `reason` value without changing the shape callers already parse.
 */

/** Why a field was reported unavailable. Extend this union, don't change the response shape. */
export type AvailabilityReason =
  | 'already_exists'
  | 'reserved'
  | 'invalid_format';

export interface FieldAvailabilityResult {
  available: boolean;
  /** Present only when `available` is false. */
  reason?: AvailabilityReason;
}

export interface AvailabilityResponse {
  fields: Record<string, FieldAvailabilityResult>;
}

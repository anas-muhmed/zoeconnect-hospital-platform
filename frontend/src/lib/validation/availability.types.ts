/**
 * Mirrors the backend's `common/validation/field-availability.types.ts`
 * contract exactly. Any module wiring up a new "is this value already
 * taken" check (Organization Management, Tenant Management, Client
 * Management, Registration, Vendor Portal, ...) should import these same
 * types rather than redefining an equivalent shape per form.
 */

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

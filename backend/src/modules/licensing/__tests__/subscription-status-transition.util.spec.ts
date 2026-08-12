import { isValidTransition } from '../utils/subscription-status-transition.util';

describe('isValidTransition (subscription status state machine)', () => {
  it('allows any initial status when there is no existing row', () => {
    expect(isValidTransition(undefined, 'trialing').ok).toBe(true);
    expect(isValidTransition(undefined, 'active').ok).toBe(true);
    expect(isValidTransition(undefined, 'suspended').ok).toBe(true);
  });

  it('always allows a same-status "transition" (idempotent retry)', () => {
    for (const s of ['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'suspended'] as const) {
      expect(isValidTransition(s, s).ok).toBe(true);
    }
  });

  it('allows the documented forward transitions', () => {
    expect(isValidTransition('trialing', 'active').ok).toBe(true);
    expect(isValidTransition('active', 'past_due').ok).toBe(true);
    expect(isValidTransition('past_due', 'active').ok).toBe(true);
    expect(isValidTransition('active', 'canceled').ok).toBe(true);
    expect(isValidTransition('active', 'suspended').ok).toBe(true);
    expect(isValidTransition('suspended', 'active').ok).toBe(true);
    expect(isValidTransition('canceled', 'active').ok).toBe(true); // resubscribe
  });

  it('rejects canceled -> trialing (the review\'s explicit example)', () => {
    const result = isValidTransition('canceled', 'trialing');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/canceled.*trialing/i);
  });

  it('rejects suspended -> trialing', () => {
    expect(isValidTransition('suspended', 'trialing').ok).toBe(false);
  });

  it('rejects incomplete -> past_due', () => {
    expect(isValidTransition('incomplete', 'past_due').ok).toBe(false);
  });
});

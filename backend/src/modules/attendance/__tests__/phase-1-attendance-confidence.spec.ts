/**
 * Phase 1 — AttendanceConfidence unit tests
 *
 * Verifies:
 *   • Factory helpers produce the correct level
 *   • Predicate helpers (isProvisional, isLocked, isFinal, isRecalculable) work
 *   • Legal transitions succeed; illegal transitions throw
 *   • toJSON / fromJSON round-trip is lossless
 */

import { AttendanceConfidence, type AttendanceConfidenceLevel } from '../confidence/attendance-confidence';

describe('AttendanceConfidence', () => {
  // ── Factory helpers ────────────────────────────────────────────────────────

  describe('factory helpers', () => {
    it('provisional() creates PROVISIONAL level', () => {
      const c = AttendanceConfidence.provisional('missing out-punch');
      expect(c.level).toBe('PROVISIONAL');
      expect(c.reason).toBe('missing out-punch');
    });

    it('high() creates HIGH level', () => {
      const c = AttendanceConfidence.high('both punches present');
      expect(c.level).toBe('HIGH');
    });

    it('final() creates FINAL level', () => {
      const c = AttendanceConfidence.final('night reconciliation complete');
      expect(c.level).toBe('FINAL');
    });

    it('locked() creates LOCKED level', () => {
      const c = AttendanceConfidence.locked('admin manual override');
      expect(c.level).toBe('LOCKED');
    });
  });

  // ── Predicates ─────────────────────────────────────────────────────────────

  describe('predicate helpers', () => {
    it('isProvisional() is true only for PROVISIONAL', () => {
      expect(AttendanceConfidence.provisional('r').isProvisional()).toBe(true);
      expect(AttendanceConfidence.high('r').isProvisional()).toBe(false);
    });

    it('isLocked() is true only for LOCKED', () => {
      expect(AttendanceConfidence.locked('r').isLocked()).toBe(true);
      expect(AttendanceConfidence.final('r').isLocked()).toBe(false);
    });

    it('isFinal() is true only for FINAL', () => {
      expect(AttendanceConfidence.final('r').isFinal()).toBe(true);
      expect(AttendanceConfidence.provisional('r').isFinal()).toBe(false);
    });

    it('isRecalculable() is true for PROVISIONAL and HIGH', () => {
      expect(AttendanceConfidence.provisional('r').isRecalculable()).toBe(true);
      expect(AttendanceConfidence.high('r').isRecalculable()).toBe(true);
      expect(AttendanceConfidence.final('r').isRecalculable()).toBe(false);
      expect(AttendanceConfidence.locked('r').isRecalculable()).toBe(false);
    });
  });

  // ── Legal transitions ──────────────────────────────────────────────────────

  describe('legal transitions', () => {
    const legalCases: [AttendanceConfidenceLevel, AttendanceConfidenceLevel][] = [
      ['PROVISIONAL', 'HIGH'],
      ['PROVISIONAL', 'FINAL'],
      ['PROVISIONAL', 'LOCKED'],
      ['HIGH',        'FINAL'],
      ['HIGH',        'LOCKED'],
      ['FINAL',       'LOCKED'],
    ];

    it.each(legalCases)('%s → %s succeeds', (from, to) => {
      const c = new AttendanceConfidence(from, 'initial');
      const next = c.transitionTo(to, 'reason');
      expect(next.level).toBe(to);
      expect(next.reason).toBe('reason');
      // Original is immutable
      expect(c.level).toBe(from);
    });
  });

  // ── Illegal transitions ────────────────────────────────────────────────────

  describe('illegal transitions', () => {
    const illegalCases: [AttendanceConfidenceLevel, AttendanceConfidenceLevel][] = [
      ['HIGH',   'PROVISIONAL'],
      ['FINAL',  'PROVISIONAL'],
      ['FINAL',  'HIGH'],
      ['LOCKED', 'PROVISIONAL'],
      ['LOCKED', 'HIGH'],
      ['LOCKED', 'FINAL'],
      ['LOCKED', 'LOCKED'],
    ];

    it.each(illegalCases)('%s → %s throws', (from, to) => {
      const c = new AttendanceConfidence(from, 'initial');
      expect(() => c.transitionTo(to, 'reason')).toThrow(
        `Illegal AttendanceConfidence transition: ${from} → ${to}`,
      );
    });
  });

  // ── Serialization round-trip ───────────────────────────────────────────────

  describe('toJSON / fromJSON', () => {
    it('round-trips without loss', () => {
      const original = AttendanceConfidence.provisional('test reason');
      const json     = original.toJSON();
      const restored = AttendanceConfidence.fromJSON(json);

      expect(restored.level).toBe(original.level);
      expect(restored.reason).toBe(original.reason);
      expect(restored.computedAt.toISOString()).toBe(original.computedAt.toISOString());
    });

    it('toJSON returns plain object with string computedAt', () => {
      const c    = AttendanceConfidence.locked('admin');
      const json = c.toJSON();

      expect(typeof json.level).toBe('string');
      expect(typeof json.reason).toBe('string');
      expect(typeof json.computedAt).toBe('string');
      expect(() => new Date(json.computedAt)).not.toThrow();
    });
  });
});

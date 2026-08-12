// Ported from zoe-platform's billingMath.test.js / typeCoercion.test.js.
// Same financial invariant: net must always equal gross - advance -
// discount, including when advance + discount exceeds gross (no clamping
// to 0), and currency formatting must never drop the sign of a negative
// result. Real source bug (fixed 2026-08-11, in zoe-platform): billing used
// to compute `Math.max(0, gross - advance - discount)`, silently flooring a
// real overpayment/refund-due amount to ₹0.

import { computeNetAmount, formatCurrency, coerceFreezerRequired } from '../utils/billing-math.util';

describe('computeNetAmount', () => {
  const cases = [
    { name: 'plain case, no discount/advance', gross: 5000, advance: 0, discount: 0, expected: 5000 },
    { name: 'advance paid, no discount', gross: 5000, advance: 2000, discount: 0, expected: 3000 },
    { name: 'discount only', gross: 5000, advance: 0, discount: 500, expected: 4500 },
    { name: 'advance + discount, still positive', gross: 5000, advance: 1500, discount: 500, expected: 3000 },
    { name: 'advance + discount exactly equal gross -> net is 0', gross: 5000, advance: 4000, discount: 1000, expected: 0 },
    // The exact regression: pre-fix this returned 0, hiding the refund.
    { name: 'advance + discount EXCEED gross -> negative, not clamped', gross: 5000, advance: 4500, discount: 1000, expected: -500 },
    { name: 'advance alone exceeds gross -> negative', gross: 2000, advance: 3000, discount: 0, expected: -1000 },
    { name: 'missing advance/discount default to 0', gross: 1200, advance: undefined, discount: undefined, expected: 1200 },
    { name: 'string-typed numeric inputs (form fields) still compute correctly', gross: '5000', advance: '4500', discount: '1000', expected: -500 },
  ];

  test.each(cases)('$name', ({ gross, advance, discount, expected }) => {
    expect(computeNetAmount({ gross, advance, discount })).toBeCloseTo(expected, 2);
  });
});

describe('formatCurrency', () => {
  const cases = [
    { name: 'positive amount', value: 1220, expected: '₹1220.00' },
    { name: 'zero', value: 0, expected: '₹0.00' },
    { name: 'negative amount keeps its sign, in front of the symbol', value: -1220, expected: '-₹1220.00' },
    { name: 'small negative amount', value: -0.5, expected: '-₹0.50' },
    { name: 'non-numeric input falls back to zero, not NaN/blank', value: 'not-a-number', expected: '₹0.00' },
  ];

  test.each(cases)('$name', ({ value, expected }) => {
    expect(formatCurrency(value)).toBe(expected);
  });
});

describe('coerceFreezerRequired', () => {
  const cases: { name: string; value: unknown; expected: 0 | 1 }[] = [
    { name: 'JS boolean true -> 1', value: true, expected: 1 },
    { name: 'JS boolean false -> 0', value: false, expected: 0 },
    { name: 'number 1 -> 1', value: 1, expected: 1 },
    { name: 'number 0 -> 0', value: 0, expected: 0 },
    { name: "string '1' -> 1", value: '1', expected: 1 },
    { name: "string '0' -> 0", value: '0', expected: 0 },
    { name: "string 'true' -> 1", value: 'true', expected: 1 },
    { name: "string 'false' -> 0", value: 'false', expected: 0 },
  ];

  test.each(cases)('$name', ({ value, expected }) => {
    expect(coerceFreezerRequired(value)).toBe(expected);
  });

  test('the coerced value is always a smallint-safe integer, never a boolean', () => {
    for (const { value } of cases) {
      expect(Number.isInteger(coerceFreezerRequired(value))).toBe(true);
    }
  });
});

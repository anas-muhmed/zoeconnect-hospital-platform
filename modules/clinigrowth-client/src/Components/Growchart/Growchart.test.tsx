import { describe, it, expect } from "vitest";

// ─── Inline types ─────────────────────────────────────────────────────────────

interface RefPoint {
  x: number;
  p3: number;
  p15: number;
  p50: number;
  p85: number;
  p97: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function interpolate(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1];
  const lo = sorted.filter(d => d.x <= x).pop()!;
  const hi = sorted.find(d => d.x > x)!;
  const t = (x - lo.x) / (hi.x - lo.x);
  const lerp = (a: number, b: number) => parseFloat((a + t * (b - a)).toFixed(2));
  return {
    p3:  lerp(lo.p3,  hi.p3),
    p15: lerp(lo.p15, hi.p15),
    p50: lerp(lo.p50, hi.p50),
    p85: lerp(lo.p85, hi.p85),
    p97: lerp(lo.p97, hi.p97),
  };
}

function cgaWeek(dob: string, gaAtBirth: number, visitDate: string): number {
  const msPerWeek = 7 * 24 * 3600 * 1000;
  const postnatalWeeks = (new Date(visitDate).getTime() - new Date(dob).getTime()) / msPerWeek;
  return gaAtBirth + postnatalWeeks;
}

function cgaWeekDisplay(dob: string, gaAtBirth: string, visitDate: string): string {
  if (!dob || !visitDate) return "—";
  const ga = parseFloat(gaAtBirth) || 40;
  return cgaWeek(dob, ga, visitDate).toFixed(1);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TWO_POINTS: RefPoint[] = [
  { x: 28, p3: 0.90, p15: 1.04, p50: 1.19, p85: 1.38, p97: 1.58 },
  { x: 30, p3: 1.15, p15: 1.34, p50: 1.53, p85: 1.76, p97: 2.03 },
];

const SINGLE_POINT: RefPoint[] = [
  { x: 32, p3: 1.45, p15: 1.69, p50: 1.94, p85: 2.24, p97: 2.58 },
];

// ─── interpolate ──────────────────────────────────────────────────────────────

describe("interpolate", () => {

  it("returns null for empty dataset", () => {
    expect(interpolate([], 30)).toBeNull();
  });

  it("returns the only row for a single-point dataset", () => {
    expect(interpolate(SINGLE_POINT, 25)!.p50).toBe(1.94);
  });

  it("clamps to first row when x is below range", () => {
    expect(interpolate(TWO_POINTS, 20)!.p50).toBe(1.19);
  });

  it("clamps to last row when x is above range", () => {
    expect(interpolate(TWO_POINTS, 55)!.p50).toBe(1.53);
  });

  it("returns exact values when x matches a knot", () => {
    const r = interpolate(TWO_POINTS, 28)!;
    expect(r.p50).toBe(1.19);
    expect(r.p3).toBe(0.90);
    expect(r.p97).toBe(1.58);
  });

  it("interpolates p50 at midpoint (x=29)", () => {
    const r = interpolate(TWO_POINTS, 29)!;
    expect(r.p50).toBeCloseTo(parseFloat(((1.19 + 1.53) / 2).toFixed(2)), 2);
  });

  it("interpolates p3 and p97 at t=0.25 (x=28.5)", () => {
    const r = interpolate(TWO_POINTS, 28.5)!;
    expect(r.p3).toBeCloseTo(parseFloat((0.90 + 0.25 * (1.15 - 0.90)).toFixed(2)), 2);
    expect(r.p97).toBeCloseTo(parseFloat((1.58 + 0.25 * (2.03 - 1.58)).toFixed(2)), 2);
  });

  it("sorts unsorted input correctly before interpolating", () => {
    const r = interpolate([TWO_POINTS[1], TWO_POINTS[0]], 29)!;
    expect(r.p50).toBeCloseTo(1.36, 2);
  });

  it("p15 and p85 exist on result (not p10/p90)", () => {
    const r = interpolate(TWO_POINTS, 29) as any;
    expect(r.p15).toBeDefined();
    expect(r.p85).toBeDefined();
    expect(r.p10).toBeUndefined();
    expect(r.p90).toBeUndefined();
  });
});

// ─── cgaWeek ──────────────────────────────────────────────────────────────────

describe("cgaWeek", () => {

  it("returns gaAtBirth when dob equals visitDate", () => {
    expect(cgaWeek("2024-01-01", 28, "2024-01-01")).toBe(28);
  });

  it("adds 1 week for a 7-day interval", () => {
    expect(cgaWeek("2024-01-01", 28, "2024-01-08")).toBeCloseTo(29, 5);
  });

  it("adds 4 weeks for a 28-day interval", () => {
    expect(cgaWeek("2024-01-01", 28, "2024-01-29")).toBeCloseTo(32, 5);
  });

  it("adds 2 weeks for a 14-day interval", () => {
    expect(cgaWeek("2024-02-01", 30, "2024-02-15")).toBeCloseTo(32, 5);
  });

  it("works for a term baby reaching 44w CGA", () => {
    expect(cgaWeek("2024-03-01", 40, "2024-03-29")).toBeCloseTo(44, 5);
  });

  it("returns less than gaAtBirth when visitDate is before dob", () => {
    expect(cgaWeek("2024-06-01", 30, "2024-05-25")).toBeLessThan(30);
  });
});

// ─── cgaWeekDisplay ───────────────────────────────────────────────────────────

describe("cgaWeekDisplay", () => {

  it("returns — when dob is empty", () => {
    expect(cgaWeekDisplay("", "28", "2024-01-08")).toBe("—");
  });

  it("returns — when visitDate is empty", () => {
    expect(cgaWeekDisplay("2024-01-01", "28", "")).toBe("—");
  });

  it("returns — when both are empty", () => {
    expect(cgaWeekDisplay("", "", "")).toBe("—");
  });

  it("formats result to one decimal place", () => {
    expect(cgaWeekDisplay("2024-01-01", "28", "2024-01-08")).toMatch(/^\d+\.\d$/);
  });

  it("returns 29.0 for 7 days postnatal at 28w GA", () => {
    expect(cgaWeekDisplay("2024-01-01", "28", "2024-01-08")).toBe("29.0");
  });

  it("defaults GA to 40 when gaAtBirth is empty", () => {
    expect(cgaWeekDisplay("2024-01-01", "", "2024-01-08")).toBe("41.0");
  });

  it("defaults GA to 40 when gaAtBirth is non-numeric", () => {
    expect(cgaWeekDisplay("2024-01-01", "abc", "2024-01-08")).toBe("41.0");
  });

  it("returns gaAtBirth.toFixed(1) when dob equals visitDate", () => {
    expect(cgaWeekDisplay("2024-01-01", "32", "2024-01-01")).toBe("32.0");
  });
});

export default {};
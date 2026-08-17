import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
// @ts-ignore
import "react-datepicker/dist/react-datepicker.css";
import { gsap } from "gsap";
import { useGrowchart } from "./GrowchartContext";
import FentonChart from "./FentonChart";
import WHOChartMini from "./WHOChartMini";
import { generateId } from "./idGen";

import {
  FENTON_WEIGHT_BOYS, FENTON_WEIGHT_GIRLS,
  FENTON_LENGTH_BOYS, FENTON_LENGTH_GIRLS,
  FENTON_HC_BOYS, FENTON_HC_GIRLS,
  type RefPoint,
} from "./referenceData";

// ─── Inject CSS once ──────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("growchart-anim-css")) {
  const tag = document.createElement("style");
  tag.id = "growchart-anim-css";
  tag.textContent = `
    .gc-visit-card { will-change: transform, opacity; }
    .gc-form-card  { will-change: transform, opacity; }
    .gc-chart-card { will-change: transform, opacity; }
    .gc-badge      { will-change: transform, opacity; }
    .gc-step       { will-change: transform, opacity; }

    /* Global rule — popper is portalled to body, so the scoped selector won't reach it */
    .react-datepicker-popper { z-index: 99999 !important; }

    .gc-datepicker-wrap { position: relative; width: 100%; }
    .gc-datepicker-wrap .react-datepicker-wrapper { width: 100%; display: block; }
    .gc-datepicker-wrap .react-datepicker__input-container { width: 100%; display: block; }
    .gc-datepicker-wrap .react-datepicker__input-container input { width: 100%; box-sizing: border-box; }
    .gc-datepicker-wrap .react-datepicker { font-size: 12px; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.10); }
    .gc-datepicker-wrap .react-datepicker__header { background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-radius: 8px 8px 0 0; padding-top: 8px; }
    .gc-datepicker-wrap .react-datepicker__current-month { font-size: 12px; font-weight: 700; color: #0f172a; }
    .gc-datepicker-wrap .react-datepicker__day-name,
    .gc-datepicker-wrap .react-datepicker__day { width: 28px; line-height: 28px; margin: 1px; font-size: 11px; }
    .gc-datepicker-wrap .react-datepicker__day--selected,
    .gc-datepicker-wrap .react-datepicker__day--keyboard-selected { background-color: #2563eb; border-radius: 4px; color: #fff; }
    .gc-datepicker-wrap .react-datepicker__day:hover { background-color: #eff6ff; border-radius: 4px; }
    .gc-datepicker-wrap .react-datepicker__navigation { top: 10px; }
    .gc-datepicker-wrap .react-datepicker__month-select,
    .gc-datepicker-wrap .react-datepicker__year-select { font-size: 11px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; }
    .gc-datepicker-wrap .react-datepicker__close-icon::after { background-color: #94a3b8; font-size: 12px; width: 14px; height: 14px; }
    .gc-datepicker-wrap .react-datepicker__today-button { font-size: 11px; padding: 4px; background: #f8fafc; border-top: 1px solid #e2e8f0; }

    .gc-step-summary { display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-radius:6px; background:#f1f5f9; cursor:pointer; transition:background 0.15s; }
    .gc-step-summary:hover { background:#e2e8f0; }
    .gc-step-summary:focus { outline: 2px solid #2563eb; outline-offset: 2px; }
    .gc-back-btn { background:none; border:none; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; padding:4px 0; text-decoration:underline; }
    .gc-back-btn:focus { outline: 2px solid #2563eb; outline-offset: 2px; }
  `;
  document.head.appendChild(tag);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Gender = "male" | "female" | "";

interface Visit {
  id: string;
  date: string;
  height: string;
  weight: string;
  headCirc: string;
}

interface VisitErrors {
  height?: string;
  weight?: string;
  headCirc?: string;
}

interface ChartPoint {
  week: number;
  weekLabel: string;
  visitDate?: string;
  height: number | null;
  weight: number | null;
  headCirc: number | null;
  l_p3: number | null; l_p15: number | null; l_p50: number | null; l_p85: number | null; l_p97: number | null;
  hc_p3: number | null; hc_p15: number | null; hc_p50: number | null; hc_p85: number | null; hc_p97: number | null;
  w_p3: number | null; w_p15: number | null; w_p50: number | null; w_p85: number | null; w_p97: number | null;
}

// Steps for sequential form
type FormStep = "name" | "dob" | "ga" | "gender" | "termWeek";
const STEPS: FormStep[] = ["name", "dob", "ga", "gender", "termWeek"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

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
    p3: lerp(lo.p3, hi.p3), p15: lerp(lo.p15, hi.p15), p50: lerp(lo.p50, hi.p50),
    p85: lerp(lo.p85, hi.p85), p97: lerp(lo.p97, hi.p97),
  };
}

/** BMI = weight(kg) / height(m)^2. Returns null if either measurement is missing/invalid. */
function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return parseFloat((weightKg / (heightM * heightM)).toFixed(2));
}

function cgaWeek(dob: string, gaAtBirth: number, visitDate: string): number {
  const msPerWeek = 7 * 24 * 3600 * 1000;
  const postnatalWeeks = (new Date(visitDate).getTime() - new Date(dob).getTime()) / msPerWeek;
  return gaAtBirth + postnatalWeeks;
}

/** Returns postnatal (chronological) age as a human-readable string, e.g. "3w 2d" or "4m 1w" */
function chronologicalAge(dob: string | undefined, visitDate: string | undefined): string {
  if (!dob || !visitDate) return "—";
  const totalDays = Math.round(
    (new Date(visitDate).getTime() - new Date(dob).getTime()) / (24 * 3600 * 1000)
  );
  if (isNaN(totalDays) || totalDays < 0) return "—";
  if (totalDays === 0) return "0 days";
  if (totalDays < 7) return `${totalDays} ${totalDays === 1 ? "day" : "days"}`;

  const years = Math.floor(totalDays / 365.25);
  const remDaysAfterYears = Math.round(totalDays - years * 365.25);

  if (years >= 1) {
    let months = Math.round(remDaysAfterYears / 30.4375);
    let finalYears = years;
    if (months >= 12) {
      finalYears += 1;
      months = 0;
    }
    if (months === 0) {
      return `${finalYears} ${finalYears === 1 ? "year" : "years"}`;
    }
    return `${finalYears} ${finalYears === 1 ? "year" : "years"} ${months} ${months === 1 ? "month" : "months"}`;
  }

  const months = Math.floor(totalDays / 30.4375);
  const remDaysAfterMonths = Math.round(totalDays - months * 30.4375);
  let remWeeks = Math.floor(remDaysAfterMonths / 7);
  let finalMonths = months;
  if (remWeeks >= 4) {
    finalMonths += 1;
    remWeeks = 0;
  }

  if (finalMonths >= 1) {
    if (remWeeks > 0) {
      return `${finalMonths} ${finalMonths === 1 ? "month" : "months"} ${remWeeks} ${remWeeks === 1 ? "week" : "weeks"}`;
    }
    return `${finalMonths} ${finalMonths === 1 ? "month" : "months"}`;
  }

  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  if (days === 0) {
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  return `${weeks} ${weeks === 1 ? "week" : "weeks"} ${days} ${days === 1 ? "day" : "days"}`;
}

function formatPmaReadable(cgaWeeks: number): string {
  if (!cgaWeeks || isNaN(cgaWeeks)) return "—";

  if (cgaWeeks <= 40) {
    const w = Math.floor(cgaWeeks);
    const d = Math.round((cgaWeeks - w) * 7);
    if (d === 0) return `${w} ${w === 1 ? "week" : "weeks"}`;
    return `${w} ${w === 1 ? "week" : "weeks"} ${d} ${d === 1 ? "day" : "days"}`;
  }

  if (cgaWeeks <= 52) {
    const w = Math.floor(cgaWeeks);
    const d = Math.round((cgaWeeks - w) * 7);
    if (d === 0) return `${w} ${w === 1 ? "week" : "weeks"}`;
    return `${w} ${w === 1 ? "week" : "weeks"} ${d} ${d === 1 ? "day" : "days"}`;
  }

  const weeksPast = cgaWeeks - 40;
  const years = Math.floor(weeksPast / 52);
  let months = Math.round((weeksPast % 52) / 4.333);
  let finalYears = years;
  if (months >= 12) {
    finalYears += 1;
    months = 0;
  }

  if (finalYears > 0) {
    if (months === 0) return `${finalYears} ${finalYears === 1 ? "year" : "years"}`;
    return `${finalYears} ${finalYears === 1 ? "year" : "years"} ${months} ${months === 1 ? "month" : "months"}`;
  }
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function buildChartData(visits: Visit[], dob: string, gaAtBirth: number, gender: Gender): ChartPoint[] {
  const male = gender !== "female";
  const lRef = male ? FENTON_LENGTH_BOYS : FENTON_LENGTH_GIRLS;
  const hcRef = male ? FENTON_HC_BOYS : FENTON_HC_GIRLS;
  const wRef = male ? FENTON_WEIGHT_BOYS : FENTON_WEIGHT_GIRLS;

  const refWeeks = [22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50];
  const refPoints: ChartPoint[] = refWeeks.map(w => {
    const l = interpolate(lRef, w);
    const hc = interpolate(hcRef, w);
    const wt = interpolate(wRef, w);
    return {
      week: w, weekLabel: `${w}w`,
      height: null, weight: null, headCirc: null,
      l_p3: l?.p3 ?? null, l_p15: l?.p15 ?? null, l_p50: l?.p50 ?? null, l_p85: l?.p85 ?? null, l_p97: l?.p97 ?? null,
      hc_p3: hc?.p3 ?? null, hc_p15: hc?.p15 ?? null, hc_p50: hc?.p50 ?? null, hc_p85: hc?.p85 ?? null, hc_p97: hc?.p97 ?? null,
      w_p3: wt?.p3 ?? null, w_p15: wt?.p15 ?? null, w_p50: wt?.p50 ?? null, w_p85: wt?.p85 ?? null, w_p97: wt?.p97 ?? null,
    };
  });

  const visitPoints: ChartPoint[] = visits
    .filter(v => v.date && dob)
    .map(v => {
      const cga = cgaWeek(dob, gaAtBirth, v.date);
      const l = interpolate(lRef, cga);
      const hc = interpolate(hcRef, cga);
      const wt = interpolate(wRef, cga);
      return {
        week: parseFloat(cga.toFixed(1)),
        weekLabel: `${cga.toFixed(1)}w\n${formatDate(v.date)}`,
        visitDate: v.date,
        height: v.height ? parseFloat(v.height) : null,
        weight: v.weight ? parseFloat(v.weight) : null,
        headCirc: v.headCirc ? parseFloat(v.headCirc) : null,
        l_p3: l?.p3 ?? null, l_p15: l?.p15 ?? null, l_p50: l?.p50 ?? null, l_p85: l?.p85 ?? null, l_p97: l?.p97 ?? null,
        hc_p3: hc?.p3 ?? null, hc_p15: hc?.p15 ?? null, hc_p50: hc?.p50 ?? null, hc_p85: hc?.p85 ?? null, hc_p97: hc?.p97 ?? null,
        w_p3: wt?.p3 ?? null, w_p15: wt?.p15 ?? null, w_p50: wt?.p50 ?? null, w_p85: wt?.p85 ?? null, w_p97: wt?.p97 ?? null,
      };
    });

  return [...refPoints, ...visitPoints].sort((a, b) => a.week - b.week);
}

// Validate a step's value
function isStepValid(step: FormStep, values: { patientName: string; dob: string; gaAtBirth: string; gender: Gender; termWeek: number }): boolean {
  switch (step) {
    case "name": return values.patientName.trim().length > 0;
    case "dob": return !!values.dob && !isNaN(new Date(values.dob).getTime()) && new Date(values.dob) <= new Date();
    case "ga": return !!values.gaAtBirth && parseFloat(values.gaAtBirth) >= 22 && parseFloat(values.gaAtBirth) <= 44;
    case "gender": return values.gender === "male" || values.gender === "female";
    case "termWeek": return values.termWeek >= 22 && values.termWeek <= 50;
    default: return false;
  }
}

function stepLabel(step: FormStep): string {
  switch (step) {
    case "name": return "Patient Name";
    case "dob": return "Date of Birth";
    case "ga": return "GA at Birth";
    case "gender": return "Gender";
    case "termWeek": return "Fenton up to week";
  }
}

function stepSummaryValue(step: FormStep, values: { patientName: string; dob: string; gaAtBirth: string; gender: Gender; termWeek: number }): string {
  switch (step) {
    case "name": return values.patientName;
    case "dob": return formatDate(values.dob);
    case "ga": return values.gaAtBirth ? `${values.gaAtBirth}w` : "";
    case "gender": return values.gender === "male" ? "♂ Male" : values.gender === "female" ? "♀ Female" : "";
    case "termWeek": return values.termWeek ? `${values.termWeek}w` : "";
  }
}

// ─── Growth Faltering Alert Logic ────────────────────────────────────────────
// Percentile band index:
//   0 = below 3rd | 1 = 3–10th | 2 = 10–50th | 3 = 50–90th | 4 = 90–97th | 5 = above 97th
// A drop of ≥ 2 bands between consecutive visits = growth faltering alert.

interface FalteringAlert {
  metric: "Weight" | "Length" | "Head Circ.";
  type: "crossing" | "below3rd";
  from?: { week: number; value: number; band: number; visitDate?: string };
  to: { week: number; value: number; band: number; visitDate?: string };
  drop?: number;
}

function getBand(value: number, p3: number | null, p15: number | null, p50: number | null, p85: number | null, p97: number | null): number {
  if (p3 == null || p15 == null || p50 == null || p85 == null || p97 == null) return -1;
  // Use a small tolerance (0.05 cm / 0.05 kg) to avoid floating-point false positives
  // at the boundary between bands
  const EPS = 0.05;
  if (value < p3 - EPS) return 0;
  if (value < p15 - EPS) return 1;
  if (value < p50 - EPS) return 2;
  if (value < p85 - EPS) return 3;
  if (value < p97 - EPS) return 4;
  return 5;
}

const BAND_LABELS = ["<3rd", "3–15th", "15–50th", "50–85th", "85–97th", ">97th"];

function detectFaltering(chartData: ChartPoint[]): FalteringAlert[] {
  const visitPts = chartData
    .filter(d => d.visitDate)
    .sort((a, b) => a.week - b.week);

  const alerts: FalteringAlert[] = [];

  const metrics: Array<{
    key: "Weight" | "Length" | "Head Circ.";
    val: (d: ChartPoint) => number | null;
    p3: (d: ChartPoint) => number | null;
    p15: (d: ChartPoint) => number | null;
    p50: (d: ChartPoint) => number | null;
    p85: (d: ChartPoint) => number | null;
    p97: (d: ChartPoint) => number | null;
  }> = [
      { key: "Weight", val: d => d.weight, p3: d => d.w_p3, p15: d => d.w_p15, p50: d => d.w_p50, p85: d => d.w_p85, p97: d => d.w_p97 },
      { key: "Length", val: d => d.height, p3: d => d.l_p3, p15: d => d.l_p15, p50: d => d.l_p50, p85: d => d.l_p85, p97: d => d.l_p97 },
      { key: "Head Circ.", val: d => d.headCirc, p3: d => d.hc_p3, p15: d => d.hc_p15, p50: d => d.hc_p50, p85: d => d.hc_p85, p97: d => d.hc_p97 },
    ];

  for (const m of metrics) {
    const pts = visitPts.filter(d => m.val(d) != null);

    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const band = getBand(m.val(curr)!, m.p3(curr), m.p15(curr), m.p50(curr), m.p85(curr), m.p97(curr));
      if (band < 0) continue;

      // Alert type 1: measurement is below the 3rd percentile at any visit
      if (band === 0) {
        // Only add once per metric (deduplicate if multiple visits are below 3rd)
        const alreadyFlagged = alerts.some(a => a.metric === m.key && a.type === "below3rd");
        if (!alreadyFlagged) {
          alerts.push({
            metric: m.key,
            type: "below3rd",
            to: { week: curr.week, value: m.val(curr)!, band, visitDate: curr.visitDate },
          });
        }
      }

      // Alert type 2: crossed ≥2 bands downward from previous visit
      if (i > 0) {
        const prev = pts[i - 1];
        const bandPrev = getBand(m.val(prev)!, m.p3(prev), m.p15(prev), m.p50(prev), m.p85(prev), m.p97(prev));
        if (bandPrev < 0) continue;
        const drop = bandPrev - band;
        if (drop >= 2) {
          alerts.push({
            metric: m.key,
            type: "crossing",
            from: { week: prev.week, value: m.val(prev)!, band: bandPrev, visitDate: prev.visitDate },
            to: { week: curr.week, value: m.val(curr)!, band, visitDate: curr.visitDate },
            drop,
          });
        }
      }
    }
  }
  return alerts;
}

function GrowthFalteringAlerts({ chartData }: { chartData: ChartPoint[] }) {
  const alerts = detectFaltering(chartData);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (alerts.length > 0 && ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 0, y: -12, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.4)" }
      );
    }
  }, [alerts.length]);

  if (alerts.length === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      aria-label="Growth faltering alerts"
      style={{
        backgroundColor: "#fff7ed",
        border: "1.5px solid #f97316",
        borderRadius: "10px",
        padding: "14px 18px",
        marginBottom: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "100%",
        boxSizing: "border-box" as const,
        boxShadow: "0 2px 12px rgba(249,115,22,0.15)",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "20px", lineHeight: 1 }}>⚠️</span>
        <div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#9a3412" }}>
            Growth Faltering Detected
          </span>
          <span style={{
            marginLeft: 10, fontSize: "11px", fontWeight: 600,
            backgroundColor: "#dc2626", color: "#fff",
            borderRadius: "999px", padding: "2px 8px",
          }}>
            {alerts.length} alert{alerts.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Individual alerts */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {alerts.map((a, i) => {
          const unit = a.metric === "Weight" ? " kg" : " cm";
          const decimals = a.metric === "Weight" ? 2 : 1;

          if (a.type === "below3rd") {
            return (
              <div key={i} style={{
                backgroundColor: "#fef2f2",
                borderLeft: "3px solid #dc2626",
                borderRadius: "0 6px 6px 0",
                padding: "8px 12px",
                fontSize: "12px",
                color: "#7c2d12",
                lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: "#dc2626" }}>
                  🔴 {a.metric} — Below 3rd percentile
                </div>
                <div>
                  At <strong>{a.to.week.toFixed(1)}w CGA</strong>
                  {a.to.visitDate ? <span style={{ color: "#78716c" }}> ({formatDate(a.to.visitDate)})</span> : null}
                  {": "}
                  <strong style={{ color: "#dc2626" }}>{a.to.value.toFixed(decimals)}{unit}</strong>
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#78716c", fontStyle: "italic" }}>
                    [&lt;3rd percentile]
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div key={i} style={{
              backgroundColor: "#ffedd5",
              borderLeft: "3px solid #f97316",
              borderRadius: "0 6px 6px 0",
              padding: "8px 12px",
              fontSize: "12px",
              color: "#7c2d12",
              lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: "#9a3412" }}>
                🟠 {a.metric} — {a.drop} major percentile band{(a.drop ?? 0) > 1 ? "s" : ""} crossed ↓
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div>
                  <span style={{ color: "#78716c", fontSize: 11 }}>From </span>
                  <strong>{a.from!.week.toFixed(1)}w CGA</strong>
                  {a.from!.visitDate ? <span style={{ color: "#78716c" }}> ({formatDate(a.from!.visitDate)})</span> : null}
                  {" — "}
                  <strong style={{ color: "#0f172a" }}>{a.from!.value.toFixed(decimals)}{unit}</strong>
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#78716c", fontStyle: "italic" }}>
                    [{BAND_LABELS[a.from!.band]}]
                  </span>
                </div>
                <div>
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>↓ To </span>
                  <strong>{a.to.week.toFixed(1)}w CGA</strong>
                  {a.to.visitDate ? <span style={{ color: "#78716c" }}> ({formatDate(a.to.visitDate)})</span> : null}
                  {" — "}
                  <strong style={{ color: "#dc2626" }}>{a.to.value.toFixed(decimals)}{unit}</strong>
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#78716c", fontStyle: "italic" }}>
                    [{BAND_LABELS[a.to.band]}]
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: "11px", color: "#9a3412", fontStyle: "italic" }}>
        Clinical review recommended. 🔴 = measurement below 3rd percentile. 🟠 = ≥2 major bands crossed downward between visits.
      </p>
    </div>
  );
}
interface VelocityEntry {
  fromWeek: number;
  toWeek: number;
  fromDate?: string;
  toDate?: string;
  days: number;
  weightGainGPerDay: number | null;
  weightGainGPerKgPerDay: number | null;
  lengthGainCmPerWeek: number | null;
  headCircGainCmPerMonth: number | null;
}

function daysBetweenDates(d1?: string, d2?: string): number | null {
  if (!d1 || !d2) return null;
  const days = Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / (24 * 3600 * 1000));
  return days > 0 ? days : null;
}

// Computes weight/length/head-circumference velocity between each pair of
// consecutive visits (not reference points). Weight velocity uses the
// average-weight method — (gain / days) / mean(w1, w2) — which is the
// standard approach for tracking preterm catch-up growth, since dividing by
// only the starting weight overstates velocity in small infants.
function computeGrowthVelocity(chartData: ChartPoint[]): VelocityEntry[] {
  const visitPts = chartData
    .filter(d => d.visitDate)
    .sort((a, b) => a.week - b.week);

  const entries: VelocityEntry[] = [];

  for (let i = 1; i < visitPts.length; i++) {
    const prev = visitPts[i - 1];
    const curr = visitPts[i];

    // Prefer exact calendar-day difference; fall back to CGA-week diff
    // (×7) if visit dates are somehow missing/invalid.
    const days = daysBetweenDates(prev.visitDate, curr.visitDate)
      ?? Math.round((curr.week - prev.week) * 7);
    if (!days || days <= 0) continue;

    let weightGainGPerDay: number | null = null;
    let weightGainGPerKgPerDay: number | null = null;
    if (prev.weight != null && curr.weight != null) {
      const gainG = (curr.weight - prev.weight) * 1000;
      weightGainGPerDay = parseFloat((gainG / days).toFixed(1));
      const avgWeightKg = (prev.weight + curr.weight) / 2;
      weightGainGPerKgPerDay = avgWeightKg > 0
        ? parseFloat((gainG / days / avgWeightKg).toFixed(1))
        : null;
    }

    let lengthGainCmPerWeek: number | null = null;
    if (prev.height != null && curr.height != null) {
      lengthGainCmPerWeek = parseFloat(((curr.height - prev.height) / (days / 7)).toFixed(2));
    }

    let headCircGainCmPerMonth: number | null = null;
    if (prev.headCirc != null && curr.headCirc != null) {
      headCircGainCmPerMonth = parseFloat(((curr.headCirc - prev.headCirc) / (days / 30.44)).toFixed(2));
    }

    entries.push({
      fromWeek: prev.week,
      toWeek: curr.week,
      fromDate: prev.visitDate,
      toDate: curr.visitDate,
      days,
      weightGainGPerDay,
      weightGainGPerKgPerDay,
      lengthGainCmPerWeek,
      headCircGainCmPerMonth,
    });
  }

  return entries;
}

function GrowthVelocityPanel({ chartData }: { chartData: ChartPoint[] }) {
  const entries = useMemo(() => computeGrowthVelocity(chartData), [chartData]);
  if (entries.length === 0) return null;

  const fmtSigned = (v: number | null, unit: string) =>
    v == null ? "—" : `${v >= 0 ? "+" : ""}${v} ${unit}`;

  return (
    <div
      role="region"
      aria-label="Growth velocity between visits"
      style={{
        backgroundColor: "#f0f9ff",
        border: "1.5px solid #38bdf8",
        borderRadius: "10px",
        padding: "14px 18px",
        marginBottom: "16px",
        width: "100%",
        boxSizing: "border-box" as const,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>📈</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0c4a6e" }}>
          Growth Velocity Between Visits
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #bae6fd" }}>
              <th style={{ textAlign: "left" as const, padding: "6px 8px", color: "#0369a1" }}>Interval</th>
              <th style={{ textAlign: "left" as const, padding: "6px 8px", color: "#0369a1" }}>Days</th>
              <th style={{ textAlign: "left" as const, padding: "6px 8px", color: "#0369a1" }}>Weight Gain</th>
              <th style={{ textAlign: "left" as const, padding: "6px 8px", color: "#0369a1" }}>Length Gain</th>
              <th style={{ textAlign: "left" as const, padding: "6px 8px", color: "#0369a1" }}>Head Circ. Gain</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e0f2fe" }}>
                <td style={{ padding: "6px 8px", color: "#334155" }}>
                  {e.fromWeek.toFixed(1)}w{e.fromDate ? ` (${formatDate(e.fromDate)})` : ""}
                  {" \u2192 "}
                  {e.toWeek.toFixed(1)}w{e.toDate ? ` (${formatDate(e.toDate)})` : ""}
                </td>
                <td style={{ padding: "6px 8px", color: "#334155" }}>{e.days}</td>
                <td style={{ padding: "6px 8px", color: "#334155" }}>
                  {e.weightGainGPerDay != null ? (
                    <>
                      {fmtSigned(e.weightGainGPerDay, "g/day")}
                      {e.weightGainGPerKgPerDay != null && (
                        <span style={{ color: "#64748b" }}>
                          {" "}({fmtSigned(e.weightGainGPerKgPerDay, "g/kg/day")})
                        </span>
                      )}
                    </>
                  ) : "—"}
                </td>
                <td style={{ padding: "6px 8px", color: "#334155" }}>
                  {fmtSigned(e.lengthGainCmPerWeek, "cm/wk")}
                </td>
                <td style={{ padding: "6px 8px", color: "#334155" }}>
                  {fmtSigned(e.headCircGainCmPerMonth, "cm/mo")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 11, color: "#0369a1", fontStyle: "italic" }}>
        g/kg/day uses the average of the two visit weights as the denominator (average-weight method), the standard approach for tracking preterm catch-up growth.
      </p>
    </div>
  );
}

interface VisitCardProps {
  v: Visit;
  idx: number;
  isNew: boolean;
  canRemove: boolean;
  dob: string;
  gaAtBirth: string;
  errors: VisitErrors | undefined;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof Omit<Visit, "id">, value: string) => void;
  onAnimateOut: (id: string, el: HTMLDivElement) => void;
  onAnimateInDone: () => void;
}

function VisitCard({ v, idx, isNew, canRemove, dob, gaAtBirth, errors, onRemove, onUpdate, onAnimateOut, onAnimateInDone }: VisitCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const headCircRef = useRef<HTMLInputElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNew && cardRef.current) {
      gsap.fromTo(cardRef.current,
        { opacity: 0, y: 22, scale: 0.94 },
        {
          opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.6)", clearProps: "transform",
          onComplete: () => {
            if (fieldsRef.current) {
              gsap.fromTo(fieldsRef.current.querySelectorAll("input, .gc-cga-display"),
                { opacity: 0, x: -10 },
                { opacity: 1, x: 0, duration: 0.28, stagger: 0.07, ease: "power2.out", clearProps: "transform" }
              );
            }
            onAnimateInDone();
          },
        }
      );
    } else if (cardRef.current) {
      gsap.set(cardRef.current, { opacity: 1, y: 0, scale: 1 });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (errors?.headCirc && headCircRef.current) {
      gsap.timeline()
        .to(headCircRef.current, { x: -6, duration: 0.07 })
        .to(headCircRef.current, { x: 6, duration: 0.07 })
        .to(headCircRef.current, { x: -4, duration: 0.06 })
        .to(headCircRef.current, { x: 4, duration: 0.06 })
        .to(headCircRef.current, { x: 0, duration: 0.05, clearProps: "transform" });
    }
  }, [errors?.headCirc]);

  function handleFocus(ref: React.RefObject<HTMLInputElement | null>) {
    if (ref.current) gsap.fromTo(ref.current,
      { scale: 1, boxShadow: "0 0 0 0px rgba(37,99,235,0)" },
      { scale: 1.025, boxShadow: "0 0 0 3px rgba(37,99,235,0.18)", duration: 0.22, ease: "power2.out" }
    );
  }
  function handleBlur(ref: React.RefObject<HTMLInputElement | null>) {
    if (ref.current) gsap.fromTo(ref.current,
      { scale: 1.025, boxShadow: "0 0 0 3px rgba(37,99,235,0.18)" },
      { scale: 1, boxShadow: "0 0 0 0px rgba(37,99,235,0)", duration: 0.18, ease: "power1.in", clearProps: "transform" }
    );
  }
  function handleRemove() {
    if (cardRef.current) onAnimateOut(v.id, cardRef.current);
    else onRemove(v.id);
  }

  return (
    <div ref={cardRef} className="gc-visit-card" style={s.visitCard}>
      <div style={s.visitCardHeader}>
        <span style={s.visitLabel}>Visit {idx + 1}</span>
        {canRemove && <button type="button" onClick={handleRemove} style={s.removeBtn} aria-label="Remove visit">✕</button>}
      </div>
      <div ref={fieldsRef}>
        <div style={s.field}>
          <label style={s.label}>Date</label>
          <div className="gc-datepicker-wrap">
            <DatePicker
              selected={v.date ? new Date(v.date) : null}
              onChange={(date: Date | null) => onUpdate(v.id, "date", date ? date.toISOString().split("T")[0] : "")}
              dateFormat="dd MMM yyyy" placeholderText="Select date"
              showMonthDropdown showYearDropdown dropdownMode="select"
              isClearable todayButton="Today"
              minDate={dob ? new Date(dob) : undefined}
              maxDate={new Date()}
              portalId="gc-datepicker-portal"
              customInput={<input style={s.input} aria-label="Visit date" />}
            />
          </div>
        </div>
        {v.date && dob && gaAtBirth && (
          <div style={{ ...s.field, marginTop: 6 }}>
            <label style={s.label}>Age at Visit</label>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ ...s.cgaDisplay, flex: 1 }}>
                <span style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 1 }}>Post-Menstrual Age (PMA)</span>
                {cgaWeek(dob, parseFloat(gaAtBirth) || 40, v.date).toFixed(1)}w
              </div>
              <div style={{ ...s.cgaDisplay, flex: 1 }}>
                <span style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 1 }}>Chronological</span>
                {chronologicalAge(dob, v.date)}
              </div>
            </div>
          </div>
        )}
        <div style={{ ...s.row, marginTop: 6 }}>
          <div style={s.field}>
            <label style={s.label}>Length (cm)</label>
            <input ref={heightRef} style={s.input} type="number" value={v.height}
              onChange={e => onUpdate(v.id, "height", e.target.value)}
              onWheel={e => e.currentTarget.blur()}
              onFocus={() => handleFocus(heightRef)} onBlur={() => handleBlur(heightRef)}
              aria-label="Length in centimetres" />
          </div>
          <div style={s.field}>
            <label style={s.label}>Weight (kg)</label>
            <input ref={weightRef} style={s.input} type="number" value={v.weight} step="0.01"
              onChange={e => onUpdate(v.id, "weight", e.target.value)}
              onWheel={e => e.currentTarget.blur()}
              onFocus={() => handleFocus(weightRef)} onBlur={() => handleBlur(weightRef)}
              aria-label="Weight in kilograms" />
          </div>
          <div style={s.field}>
            <label style={s.label}>Head Circ.(cm)</label>
            {errors?.headCirc && <span style={s.errorText} role="alert">{errors.headCirc}</span>}
            <input ref={headCircRef} style={s.input} type="number" value={v.headCirc}
              onChange={e => onUpdate(v.id, "headCirc", e.target.value)}
              onWheel={e => e.currentTarget.blur()}
              onFocus={() => handleFocus(headCircRef)} onBlur={() => handleBlur(headCircRef)}
              aria-label="Head circumference in centimetres" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SequentialPatientForm ────────────────────────────────────────────────────
// Reveals each Patient Info field one-by-one with GSAP animations.
// Completed steps collapse to a compact summary line that can be clicked to edit.
interface SequentialPatientFormProps {
  patientName: string;
  dob: string;
  gaAtBirth: string;
  gender: Gender;
  termWeek: number;
  onChange: (field: "patientName" | "dob" | "gaAtBirth" | "gender" | "termWeek", value: string | number | Gender) => void;
}

function SequentialPatientForm({ patientName, dob, gaAtBirth, gender, termWeek, onChange }: SequentialPatientFormProps) {
  const [activeStep, setActiveStep] = useState<FormStep>("name");
  const stepRefs = useRef<Record<FormStep, HTMLDivElement | null>>({
    name: null, dob: null, ga: null, gender: null, termWeek: null,
  });
  // Track which steps are done (all steps before activeStep are "done")
  const activeIdx = STEPS.indexOf(activeStep);
  const doneSteps = STEPS.slice(0, activeIdx);

  const values = { patientName, dob, gaAtBirth, gender, termWeek };

  // Animate a step in
  function animateStepIn(el: HTMLDivElement | null) {
    if (!el) return;
    gsap.fromTo(el,
      { opacity: 0, y: 18, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.4)", clearProps: "transform" }
    );
  }

  // Animate a step out (collapse), then call onDone
  function animateStepOut(el: HTMLDivElement | null, onDone: () => void) {
    if (!el) { onDone(); return; }
    gsap.to(el, {
      opacity: 0, y: -10, duration: 0.22, ease: "power2.in",
      onComplete: onDone,
    });
  }

  // Shake animation for invalid
  function shakeStep(el: HTMLDivElement | null) {
    if (!el) return;
    gsap.timeline()
      .to(el, { x: -7, duration: 0.07 })
      .to(el, { x: 7, duration: 0.07 })
      .to(el, { x: -5, duration: 0.06 })
      .to(el, { x: 5, duration: 0.06 })
      .to(el, { x: 0, duration: 0.05, clearProps: "transform" });
  }

  // Animate in the first step on mount
  useEffect(() => {
    animateStepIn(stepRefs.current["name"]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function goBack() {
    if (activeIdx === 0) return;
    const prevStep = STEPS[activeIdx - 1];
    animateStepOut(stepRefs.current[activeStep], () => {
      setActiveStep(prevStep);
    });
  }

  function jumpToStep(step: FormStep) {
    if (step === activeStep) return;
    animateStepOut(stepRefs.current[activeStep], () => {
      setActiveStep(step);
    });
  }

  // When activeStep changes, animate in the new active step
  useEffect(() => {
    // small RAF delay so the DOM has rendered
    const raf = requestAnimationFrame(() => {
      animateStepIn(stepRefs.current[activeStep]);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeStep]);

  const allDone = activeIdx >= STEPS.length;

  // Auto-advance helper — called when a field's value becomes valid
  function tryAdvance(step: FormStep) {
    if (!isStepValid(step, values)) return;
    const nextIdx = STEPS.indexOf(step) + 1;
    if (nextIdx >= STEPS.length) return;
    const nextStep = STEPS[nextIdx];
    animateStepOut(stepRefs.current[step], () => setActiveStep(nextStep));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Done steps — compact summary lines */}
      {doneSteps.map(step => (
        <button
          key={step}
          className="gc-step-summary"
          type="button"
          onClick={() => jumpToStep(step)}
          aria-label={`Edit ${stepLabel(step)}`}
          title="Click to edit"
        >
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{stepLabel(step)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{stepSummaryValue(step, values)} <span style={{ color: "#94a3b8", fontWeight: 400 }}>✎</span></span>
        </button>
      ))}

      {/* Active step */}
      {!allDone && (
        <div
          className="gc-step"
          ref={el => { stepRefs.current[activeStep] = el; }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
          role="group"
          aria-label={stepLabel(activeStep)}
        >
          {activeStep === "name" && (
            <div style={s.field}>
              <label style={s.label} htmlFor="gc-patient-name">Patient Name</label>
              <input
                id="gc-patient-name"
                style={s.input}
                value={patientName}
                onChange={e => onChange("patientName", e.target.value)}
                onBlur={() => tryAdvance("name")}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); tryAdvance("name"); } }}
                placeholder="e.g. Baby Doe"
                autoFocus
                aria-required="true"
              />
            </div>
          )}

          {activeStep === "dob" && (
            <div style={s.field}>
              <label style={s.label}>Date of Birth</label>
              <div className="gc-datepicker-wrap">
                <DatePicker
                  selected={dob ? new Date(dob) : null}
                  onChange={(date: Date | null) => {
                    const iso = date ? date.toISOString().split("T")[0] : "";
                    onChange("dob", iso);
                    if (iso) {
                      const nextVals = { patientName, dob: iso, gaAtBirth, gender, termWeek };
                      if (isStepValid("dob", nextVals)) {
                        setTimeout(() => animateStepOut(stepRefs.current["dob"], () => setActiveStep("ga")), 120);
                      }
                    }
                  }}
                  dateFormat="dd MMM yyyy" placeholderText="Select date"
                  showMonthDropdown showYearDropdown dropdownMode="select"
                  yearDropdownItemNumber={10} scrollableYearDropdown
                  maxDate={new Date()} isClearable todayButton="Today"
                  portalId="gc-datepicker-portal"
                  customInput={<input style={s.input} aria-label="Date of birth" autoFocus />}
                />              </div>
            </div>
          )}

          {activeStep === "ga" && (
            <div style={s.field}>
              <label style={s.label} htmlFor="gc-ga">GA at Birth (weeks, 22–44)</label>
              <input
                id="gc-ga"
                style={s.input}
                type="number"
                value={gaAtBirth}
                onChange={e => onChange("gaAtBirth", e.target.value)}
                onWheel={e => e.currentTarget.blur()}
                onBlur={() => {
                  if (isStepValid("ga", values)) tryAdvance("ga");
                  else shakeStep(stepRefs.current["ga"]);
                }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (isStepValid("ga", values)) tryAdvance("ga"); else shakeStep(stepRefs.current["ga"]); } }}
                min="22" max="44" step="1"
                placeholder="e.g. 28"
                autoFocus
                aria-required="true"
              />
            </div>
          )}

          {activeStep === "gender" && (
            <div style={s.field}>
              <label style={s.label}>Gender</label>
              <div className="gc-gender-row" style={s.genderRow}>
                {(["male", "female"] as const).map(g => (
                  <button
                    key={g}
                    type="button"
                    data-gender={g}
                    onClick={() => {
                      onChange("gender", g);
                      const el = stepRefs.current["gender"];
                      const btn = document.querySelector(`[data-gender="${g}"]`);
                      if (btn) {
                        gsap.timeline()
                          .to(btn, { scale: 0.92, duration: 0.08 })
                          .to(btn, { scale: 1.06, duration: 0.15, ease: "power2.out" })
                          .to(btn, {
                            scale: 1, duration: 0.12, ease: "power1.in", onComplete: () => {
                              animateStepOut(el, () => setActiveStep("termWeek"));
                            }
                          });
                      }
                    }}
                    style={{ ...s.genderBtn, ...(gender === g ? (g === "male" ? s.gMale : s.gFemale) : {}) }}
                    aria-pressed={gender === g}
                  >
                    {g === "male" ? "♂ Male" : "♀ Female"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeStep === "termWeek" && (
            <div style={s.field}>
              <label style={s.label} htmlFor="gc-termweek">Show Fenton up to week (22–50, default 50)</label>
              <input
                id="gc-termweek"
                style={s.input}
                type="number"
                value={termWeek}
                onChange={e => onChange("termWeek", Number(e.target.value))}
                onWheel={e => e.currentTarget.blur()}
                onBlur={() => { if (isStepValid("termWeek", values)) tryAdvance("termWeek"); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (isStepValid("termWeek", values)) tryAdvance("termWeek"); } }}
                min="22" max="50" step="1"
                autoFocus
                aria-required="true"
              />
            </div>
          )}

          {/* Back link only — no Continue button */}
          {activeIdx > 0 && (
            <button className="gc-back-btn" type="button" onClick={goBack} aria-label="Go back to previous field">
              ← Back
            </button>
          )}
        </div>
      )}

      {/* All steps done — compact overview with edit option */}
      {allDone && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {STEPS.map(step => (
            <button
              key={step}
              className="gc-step-summary"
              type="button"
              onClick={() => jumpToStep(step)}
              aria-label={`Edit ${stepLabel(step)}`}
            >
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{stepLabel(step)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{stepSummaryValue(step, values)} <span style={{ color: "#94a3b8" }}>✎</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GrowChart() {
  const navigate = useNavigate();
  const { setPatient, homeForm, setHomeForm, patient } = useGrowchart();
  const newId = generateId;

  // Use patient context data if available, otherwise fall back to homeForm
  const patientName = patient?.patientName || homeForm.patientName;
  const dob = patient?.dob || homeForm.dob;
  const gender = patient?.gender || homeForm.gender;
  const gaAtBirth = patient?.gaAtBirth || homeForm.gaAtBirth;
  const visits = patient?.visits || homeForm.visits;
  const plotted = !!patient || homeForm.plotted;

  const [newVisitId, setNewVisitId] = useState<string | null>(null);
  const [formCollapsed, setFormCollapsed] = useState(false);

  const termWeek: number = (homeForm as any).termWeek ?? 50;
  function setTermWeek(v: number) {
    setHomeForm(prev => ({ ...prev, termWeek: v } as any));
  }

  // chartData is derived live from current visits — no stale state.
  // This means alerts and arrows update immediately as measurements change.
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!plotted || !dob) return [];
    const ga = parseFloat(gaAtBirth) || 40;
    return buildChartData(visits, dob, ga, gender);
  }, [plotted, visits, dob, gaAtBirth, gender]);

  const [visitErrors, setVisitErrors] = useState<Record<string, VisitErrors>>({});

  // ─── GSAP refs ──────────────────────────────────────────────────────────────
  const pageRef = useRef<HTMLDivElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const chartCardRef = useRef<HTMLDivElement>(null);
  const patientBadgeRef = useRef<HTMLDivElement>(null);
  const plotBtnRef = useRef<HTMLButtonElement>(null);

  // ── Page mount animation ────────────────────────────────────────────────────
  // NOTE: only handles the "no patient plotted yet" mount case. When a patient
  // is already plotted, the "Chart card reveal" effect below owns the opacity
  // animation instead — previously both effects animated chartCardRef's
  // opacity on the same navigation, and GSAP's default overwrite behavior
  // would kill the first tween and snap opacity back down mid-animation,
  // causing a visible brightness flash/dip right after "View Chart" is clicked.
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (chartCardRef.current && !plotted) {
        gsap.from(chartCardRef.current, { x: 40, opacity: 0, duration: 0.7, ease: "power3.out" });
      }
    }, pageRef);
    return () => ctx.revert();
  }, []);

  // ── Patient badge slide-in ──────────────────────────────────────────────────
  useEffect(() => {
    if (plotted && patientBadgeRef.current) {
      gsap.fromTo(patientBadgeRef.current,
        { y: -12, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" }
      );
    }
  }, [plotted]);

  // ── Chart card reveal ───────────────────────────────────────────────────────
  useEffect(() => {
    if (plotted && chartCardRef.current) {
      gsap.fromTo(chartCardRef.current,
        { opacity: 0.4, scale: 0.98, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "power2.out" }
      );
    }
  }, [plotted]);

  // ─── Visit management ───────────────────────────────────────────────────────
  function addVisit() {
    const id = newId();
    setNewVisitId(id);
    setHomeForm(prev => ({
      ...prev,
      visits: [...prev.visits, { id, date: "", height: "", weight: "", headCirc: "" }],
    }));
  }

  function handleAnimateOut(id: string, el: HTMLDivElement) {
    const h = el.offsetHeight;
    gsap.set(el, { height: h, overflow: "hidden" });
    gsap.to(el, {
      opacity: 0, x: -24, height: 0, paddingTop: 0, paddingBottom: 0, marginBottom: 0,
      duration: 0.32, ease: "power2.in",
      onComplete: () => {
        setHomeForm(prev => ({ ...prev, visits: prev.visits.filter(v => v.id !== id) }));
      },
    });
  }

  function updateVisit(id: string, field: keyof Omit<Visit, "id">, value: string) {
    setHomeForm(prev => ({
      ...prev,
      visits: prev.visits.map(v => v.id === id ? { ...v, [field]: value } : v),
    }));
    const num = parseFloat(value);
    let err: string | undefined;
    if (value && field === "headCirc" && num > 55) err = "Max 55 cm";
    setVisitErrors(prev => ({ ...prev, [id]: { ...prev[id], [field]: err } }));
  }

  const handleAnimateInDone = useCallback(() => setNewVisitId(null), []);

  function handlePlot(e: React.FormEvent) {
    e.preventDefault();
    const hasErrors = Object.values(visitErrors).some(errs => errs && Object.values(errs).some(Boolean));
    if (hasErrors) return;

    if (plotBtnRef.current) {
      gsap.timeline()
        .to(plotBtnRef.current, { scale: 0.93, duration: 0.1, ease: "power1.in" })
        .to(plotBtnRef.current, { scale: 1, duration: 0.25, ease: "elastic.out(1.2, 0.5)" });
    }

    const ga = parseFloat(gaAtBirth) || 40;
    setHomeForm(prev => ({ ...prev, plotted: true }));
    setPatient({ patientName, dob, gender, gaAtBirth, visits });
  }

  function handleReset() {
    if (formCardRef.current) {
      gsap.timeline({ onComplete: doReset })
        .to(formCardRef.current, { x: -6, duration: 0.07 })
        .to(formCardRef.current, { x: 6, duration: 0.07 })
        .to(formCardRef.current, { x: -4, duration: 0.06 })
        .to(formCardRef.current, { x: 0, duration: 0.06 });
    } else {
      doReset();
    }
  }

  function doReset() {
    setHomeForm({
      patientName: "", dob: "", gender: "", gaAtBirth: "",
      visits: [{ id: newId(), date: "", height: "", weight: "", headCirc: "" }],
      plotted: false,
      termWeek: 50,
    } as any);
    setVisitErrors({});
    setNewVisitId(null);
  }

  const splitWeekClamped = Math.max(22, Math.min(50, termWeek));

  // Handler for SequentialPatientForm onChange
  function handlePatientFieldChange(
    field: "patientName" | "dob" | "gaAtBirth" | "gender" | "termWeek",
    value: string | number | Gender
  ) {
    if (field === "termWeek") {
      setTermWeek(value as number);
    } else {
      setHomeForm(prev => ({ ...prev, [field]: value }));
    }
  }

  return (
    <div ref={pageRef} style={s.page}>
      <div style={s.wrapper}>
        <div style={s.header}>
          {plotted && patientName && (
            <div ref={patientBadgeRef} className="gc-badge" style={s.patientBadge}>
              <span style={s.patientName}>{patientName}</span>
              {gender && <span style={{ marginLeft: 8 }}>{gender === "male" ? "♂" : "♀"}</span>}
              {dob && (
                <span style={s.patientDob}>
                  DOB: {formatDate(dob)}{gaAtBirth ? ` · GA ${gaAtBirth}w` : ""}
                </span>
              )}
            </div>
          )}
        </div>

        {plotted && <GrowthFalteringAlerts chartData={chartData} />}
        {plotted && <GrowthVelocityPanel chartData={chartData} />}

        <div style={s.body}>
          {/* ── Chart card ── */}
          <div ref={chartCardRef} className="gc-chart-card" style={s.chartCard}>
            {plotted && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                  onClick={() => navigate("/detail")}
                  style={s.detailBtn}
                  onMouseEnter={e => gsap.to(e.currentTarget, { x: 3, duration: 0.2 })}
                  onMouseLeave={e => gsap.to(e.currentTarget, { x: 0, duration: 0.2 })}
                >
                  WHO Charts →
                </button>
              </div>
            )}

            {!plotted ? (
              <Placeholder />
            ) : (() => {
              const patientPts = chartData
                .filter(d => d.height != null || d.weight != null || d.headCirc != null)
                .map(d => ({
                  week: d.week,
                  height: d.height,
                  weight: d.weight,
                  headCirc: d.headCirc,
                  bmi: computeBmi(d.weight, d.height),
                  label: d.weekLabel,
                  visitDate: d.visitDate,
                  dob,
                }));

              const chartTypePref = (localStorage.getItem("gc_chartType") as "fenton" | "who") || "fenton";
              const isWhoOnly = chartTypePref === "who";

              const fentonPts = isWhoOnly ? [] : patientPts.filter(p => p.week <= splitWeekClamped);
              const whoPts = isWhoOnly ? patientPts : patientPts.filter(p => p.week > splitWeekClamped);

              // Build alertWeeks: separate arrow per metric per visit, each in its own colour
              const METRIC_COLORS = {
                weight: "#ca8a04",  // amber — matches patient weight dots
                height: "#16a34a",  // green — matches patient length dots
                headCirc: "#dc2626",  // red   — matches patient head circ dots
              } as const;

              const alertWeeks = (() => {
                const result: { week: number; label: string; color: string }[] = [];
                const visitPts = chartData
                  .filter(d => d.visitDate)
                  .sort((a, b) => a.week - b.week);

                const mCfg: Array<{
                  key: keyof typeof METRIC_COLORS;
                  shortLabel: string;
                  val: (d: ChartPoint) => number | null;
                  p3: (d: ChartPoint) => number | null;
                  p15: (d: ChartPoint) => number | null;
                  p50: (d: ChartPoint) => number | null;
                  p85: (d: ChartPoint) => number | null;
                  p97: (d: ChartPoint) => number | null;
                }> = [
                    { key: "height", shortLabel: "L", val: d => d.height, p3: d => d.l_p3, p15: d => d.l_p15, p50: d => d.l_p50, p85: d => d.l_p85, p97: d => d.l_p97 },
                    { key: "weight", shortLabel: "W", val: d => d.weight, p3: d => d.w_p3, p15: d => d.w_p15, p50: d => d.w_p50, p85: d => d.w_p85, p97: d => d.w_p97 },
                    { key: "headCirc", shortLabel: "HC", val: d => d.headCirc, p3: d => d.hc_p3, p15: d => d.hc_p15, p50: d => d.hc_p50, p85: d => d.hc_p85, p97: d => d.hc_p97 },
                  ];

                const seen = new Set<string>();

                for (const m of mCfg) {
                  const pts = visitPts.filter(d => m.val(d) != null && d.week <= splitWeekClamped);
                  for (let i = 0; i < pts.length; i++) {
                    const curr = pts[i];
                    const band = getBand(m.val(curr)!, m.p3(curr), m.p15(curr), m.p50(curr), m.p85(curr), m.p97(curr));
                    if (band < 0) continue;

                    const addArrow = (label: string) => {
                      // One arrow per metric total — dedup by metric key only
                      if (seen.has(m.key)) return;
                      seen.add(m.key);
                      result.push({ week: curr.week, label, color: METRIC_COLORS[m.key] });
                    };

                    if (band === 0) {
                      addArrow(`${m.shortLabel}<3rd`);
                    } else if (i > 0) {
                      const prev = pts[i - 1];
                      const bandPrev = getBand(m.val(prev)!, m.p3(prev), m.p15(prev), m.p50(prev), m.p85(prev), m.p97(prev));
                      if (bandPrev >= 0 && bandPrev - band >= 2) {
                        addArrow(`${m.shortLabel}↓${bandPrev - band}`);
                      }
                    }
                  }
                }
                return result;
              })();

              return isWhoOnly ? (
                <>
                  <h3 style={{ margin: "0 0 12px 0" }}>
                    WHO Growth Reference Chart – {gender === "male" ? "Boys" : "Girls"}
                  </h3>
                  {whoPts.length > 0 ? (
                    <WHOChartMini
                      gender={gender}
                      patientData={whoPts}
                      allPatientData={patientPts}
                      patientName={patientName}
                      dob={dob}
                      gaAtBirth={gaAtBirth}
                    />
                  ) : (
                    <p style={{ color: "#64748b", fontSize: "14px" }}>No visit data available to plot on WHO chart.</p>
                  )}
                </>
              ) : (
                <>
                  <h3 style={{ margin: "0 0 12px 0" }}>
                    Fenton Preterm Growth Chart – {gender === "male" ? "Boys" : "Girls"}
                  </h3>
                  <h4 style={{ margin: "16px 0 8px" }}>Fenton (&le; {splitWeekClamped}w CGA)</h4>
                  <FentonChart gender={gender} patientData={fentonPts} splitWeek={splitWeekClamped} alertWeeks={alertWeeks} />
                  {whoPts.length > 0 && (
                    <h4 style={{ margin: "24px 0 8px" }}>WHO (after {splitWeekClamped}w CGA)</h4>
                  )}
                  {patientPts.length > 0 && (
                    <WHOChartMini
                      gender={gender}
                      patientData={whoPts}
                      allPatientData={patientPts}
                      patientName={patientName}
                      dob={dob}
                      gaAtBirth={gaAtBirth}
                    />
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

function Placeholder() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
      );
    }
  }, []);
  return (
    <div ref={ref} style={s.placeholder}>
      <p style={s.placeholderText}>Enter Patient Parameters to view Fenton Grid markings</p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "calc(100vh - 52px)", backgroundColor: "#f8fafc", padding: "24px", fontFamily: "system-ui, sans-serif", boxSizing: "border-box", width: "100%" },
  wrapper: { maxWidth: "100%", margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
  addPatientBtn: { padding: "8px 16px", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "background 0.2s" },
  patientBadge: { backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "8px 16px" },
  patientName: { fontWeight: 700, fontSize: "14px", color: "#0f172a" },
  patientDob: { fontSize: "12px", color: "#475569", marginLeft: 8 },
  body: { display: "flex", gap: "20px", alignItems: "flex-start", width: "100%" },
  formCard: { backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", flexDirection: "column", gap: "0px", alignSelf: "flex-start", position: "sticky" as const, top: 0, maxHeight: "calc(100vh - 72px)", overflowY: "auto" as const },
  chartCard: { backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "24px", flex: 1, minWidth: 0 },
  sectionTitle: { margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a" },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  row: { display: "flex", gap: "8px" },
  label: { fontSize: "11px", fontWeight: 600, color: "#475569" },
  input: { padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#0f172a", width: "100%", boxSizing: "border-box" as const },
  cgaDisplay: { padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "13px", color: "#0f172a", backgroundColor: "#f8fafc", fontWeight: 600 },
  errorText: { fontSize: "11px", color: "#ef4444", fontWeight: 500 },
  divider: { borderTop: "1px solid #e2e8f0", margin: "4px 0" },
  genderRow: { display: "flex", gap: "8px" },
  genderBtn: { flex: 1, padding: "8px 0", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 500 },
  gMale: { backgroundColor: "#eff6ff", borderColor: "#2563eb", color: "#2563eb" },
  gFemale: { backgroundColor: "#fdf2f8", borderColor: "#db2777", color: "#db2777" },
  visitsHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  addBtn: { padding: "4px 12px", backgroundColor: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" },
  visitList: { display: "flex", flexDirection: "column", gap: "10px" },
  visitCard: { border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", backgroundColor: "#f8fafc" },
  visitCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" },
  visitLabel: { fontSize: "12px", fontWeight: 700, color: "#0f172a" },
  removeBtn: { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "12px" },
  btnRow: { display: "flex", gap: "8px", marginTop: "12px" },
  btnPrimary: { flex: 1, padding: "10px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  btnSecondary: { flex: 1, padding: "10px", backgroundColor: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px", fontWeight: 500, cursor: "pointer" },
  placeholder: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" },
  placeholderText: { color: "#64748b", fontSize: "14px" },
  detailBtn: { padding: "8px 16px", backgroundColor: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
  collapseBtn: { background: "none", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "#475569", padding: "4px 8px", lineHeight: 1 },
};
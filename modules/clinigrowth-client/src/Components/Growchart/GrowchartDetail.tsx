import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  Title,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import {
  FENTON_WEIGHT_BOYS, FENTON_WEIGHT_GIRLS,
  FENTON_LENGTH_BOYS, FENTON_LENGTH_GIRLS,
  FENTON_HC_BOYS, FENTON_HC_GIRLS,
  WHO_WEIGHT_BOYS, WHO_WEIGHT_GIRLS,
  WHO_LENGTH_BOYS, WHO_LENGTH_GIRLS,
  WHO_HC_BOYS, WHO_HC_GIRLS,
  type RefPoint,
} from "./referenceData";
import { useGrowchart } from "./GrowchartContext";
import { generateId } from "./idGen";
import { AuditExportButtons, PdfButton, type PatientPoint } from "./WHOChartMini";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, Title);

// ─── Types ────────────────────────────────────────────────────────────────────
type Metric = "height" | "weight" | "headCirc" | "all";
type GenderView = "both" | "male" | "female";
type Gender = "male" | "female" | "";
type ChartType = "fenton" | "who";

interface Visit {
  id: string;
  date: string;
  height: string;
  weight: string;
  headCirc: string;
}

interface ChartPoint {
  week: number;
  weekLabel: string;
  patient: number | null;
  boys: Record<"p3" | "p15" | "p50" | "p85" | "p97", number | null>;
  girls: Record<"p3" | "p15" | "p50" | "p85" | "p97", number | null>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function interpolate(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data || !data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) {
    const maxPt = sorted[sorted.length - 1];
    const weeksPast = x - maxPt.x;
    const factor = 1 + (weeksPast / 250) * 0.7;
    return {
      p3: parseFloat((maxPt.p3 * factor).toFixed(2)),
      p15: parseFloat((maxPt.p15 * factor).toFixed(2)),
      p50: parseFloat((maxPt.p50 * factor).toFixed(2)),
      p85: parseFloat((maxPt.p85 * factor).toFixed(2)),
      p97: parseFloat((maxPt.p97 * factor).toFixed(2)),
    };
  }
  const lo = sorted.filter(d => d.x <= x).pop()!;
  const hi = sorted.find(d => d.x > x)!;
  const t = (x - lo.x) / (hi.x - lo.x);
  const l = (a: number, b: number) => parseFloat((a + t * (b - a)).toFixed(2));
  return { p3: l(lo.p3, hi.p3), p15: l(lo.p15, hi.p15), p50: l(lo.p50, hi.p50), p85: l(lo.p85, hi.p85), p97: l(lo.p97, hi.p97) };
}

function cgaWeek(dob: string, gaAtBirth: number, visitDate: string): number {
  const dobMs = new Date(dob).getTime();
  const visitMs = new Date(visitDate).getTime();
  if (isNaN(dobMs) || isNaN(visitMs)) return gaAtBirth;
  return gaAtBirth + (visitMs - dobMs) / (7 * 24 * 3600 * 1000);
}

function chronologicalAge(dob: string, visitDate: string): string {
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
  if (months >= 1) {
    const remDays = Math.round(totalDays - months * 30.4375);
    const remWeeks = Math.floor(remDays / 7);
    if (remWeeks > 0 && months < 6) {
      return `${months} ${months === 1 ? "month" : "months"} ${remWeeks} ${remWeeks === 1 ? "week" : "weeks"}`;
    }
    return `${months} ${months === 1 ? "month" : "months"}`;
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

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function getStorageItem<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function ceilTo(v: number, step: number) { return Math.ceil(v / step) * step; }

// ─── Chart Data Builder ──────────────────────────────────────────────────────
function buildData(visits: Visit[], dob: string, gaAtBirth: number, metric: Metric, chartType: ChartType): ChartPoint[] {
  let bRef = metric === "height" ? FENTON_LENGTH_BOYS : metric === "weight" ? FENTON_WEIGHT_BOYS : FENTON_HC_BOYS;
  let gRef = metric === "height" ? FENTON_LENGTH_GIRLS : metric === "weight" ? FENTON_WEIGHT_GIRLS : FENTON_HC_GIRLS;

  if (chartType === "who") {
    bRef = metric === "height" ? (WHO_LENGTH_BOYS || FENTON_LENGTH_BOYS) : metric === "weight" ? (WHO_WEIGHT_BOYS || FENTON_WEIGHT_BOYS) : (WHO_HC_BOYS || FENTON_HC_BOYS);
    gRef = metric === "height" ? (WHO_LENGTH_GIRLS || FENTON_LENGTH_GIRLS) : metric === "weight" ? (WHO_WEIGHT_GIRLS || FENTON_WEIGHT_GIRLS) : (WHO_HC_GIRLS || FENTON_HC_GIRLS);
  }

  const refWeeks: number[] = [];
  for (let w = 22; w <= gaAtBirth; w += 2) refWeeks.push(w);
  if (!refWeeks.includes(gaAtBirth)) refWeeks.push(gaAtBirth);
  for (let y = 0; y < 5; y++) {
    const base = gaAtBirth + y * 52;
    refWeeks.push(
      base + 8.67, base + 17.33, base + 26,
      base + 34.67, base + 43.33, base + 52
    );
  }

  const pts: ChartPoint[] = refWeeks.map(w => {
    const b = interpolate(bRef, w), g = interpolate(gRef, w);
    let label = "";
    if (w <= gaAtBirth) {
      label = w === gaAtBirth ? "Birth" : `${Math.round(w)}w`;
    } else {
      const weeksPast = w - gaAtBirth;
      const years = Math.floor(weeksPast / 52);
      const months = Math.round((weeksPast % 52) / 4.333);
      if (months === 0) label = `${years} yr`;
      else if (months === 12) label = `${years + 1} yr`;
      else label = years > 0 ? `${years}y ${months}m` : `${months}m`;
    }
    return {
      week: w, weekLabel: label, patient: null,
      boys: { p3: b?.p3 ?? null, p15: b?.p15 ?? null, p50: b?.p50 ?? null, p85: b?.p85 ?? null, p97: b?.p97 ?? null },
      girls: { p3: g?.p3 ?? null, p15: g?.p15 ?? null, p50: g?.p50 ?? null, p85: g?.p85 ?? null, p97: g?.p97 ?? null },
    };
  });

  visits.filter(v => v.date && dob).forEach(v => {
    const cga = cgaWeek(dob, gaAtBirth, v.date);
    const b = interpolate(bRef, cga);
    const g = interpolate(gRef, cga);
    const raw = metric === "height" ? v.height : metric === "weight" ? v.weight : v.headCirc;
    let tooltipLbl = cga <= gaAtBirth
      ? `${cga.toFixed(1)}w`
      : `${Math.floor((cga - gaAtBirth) / 52)}y ${Math.round(((cga - gaAtBirth) % 52) / 4.333)}m`;
    const vp: ChartPoint = {
      week: parseFloat(cga.toFixed(1)),
      weekLabel: `${tooltipLbl}\n${formatDate(v.date)}`,
      patient: raw ? parseFloat(raw) : null,
      boys: { p3: b?.p3 ?? null, p15: b?.p15 ?? null, p50: b?.p50 ?? null, p85: b?.p85 ?? null, p97: b?.p97 ?? null },
      girls: { p3: g?.p3 ?? null, p15: g?.p15 ?? null, p50: g?.p50 ?? null, p85: g?.p85 ?? null, p97: g?.p97 ?? null },
    };
    const idx = pts.findIndex(r => Math.abs(r.week - vp.week) < 0.5 && r.patient === null);
    if (idx >= 0) pts[idx] = { ...pts[idx], patient: vp.patient, weekLabel: vp.weekLabel };
    else pts.push(vp);
  });

  return pts.sort((a, b) => a.week - b.week);
}

// ─── Series Configs & Builders ───────────────────────────────────────────────
const PERCENTILE_COLORS = ["#22d3ee", "#34d399", "#3b82f6", "#f59e0b", "#f43f5e"];
const BOYS_COLORS = PERCENTILE_COLORS;
const GIRLS_COLORS = PERCENTILE_COLORS;
const PATIENT_COLOR = "#111827";
const PCTS = ["3rd", "15th", "50th", "85th", "97th"] as const;

function buildSeries(data: ChartPoint[], genderView: GenderView) {
  const showBoys = genderView === "both" || genderView === "male";
  const showGirls = genderView === "both" || genderView === "female";
  const percentileKeys = ["p3", "p15", "p50", "p85", "p97"] as const;
  const datasets: Array<any> = [];

  if (showBoys) {
    percentileKeys.forEach((percentile, index) => {
      datasets.push({
        label: `Boys ${PCTS[index]}`,
        data: data.map(point => ({ x: point.week, y: point.boys?.[percentile] ?? null, label: point.weekLabel })),
        borderColor: BOYS_COLORS[index],
        borderWidth: percentile === "p50" ? 2 : 1,
        borderDash: [],
        tension: 0.35, pointRadius: 0, fill: false, spanGaps: true,
      });
    });
  }

  if (showGirls) {
    percentileKeys.forEach((percentile, index) => {
      datasets.push({
        label: `Girls ${PCTS[index]}`,
        data: data.map(point => ({ x: point.week, y: point.girls?.[percentile] ?? null, label: point.weekLabel })),
        borderColor: GIRLS_COLORS[index],
        borderWidth: percentile === "p50" ? 2 : 1,
        borderDash: [4, 3],
        tension: 0.35, pointRadius: 0, fill: false, spanGaps: true,
      });
    });
  }

  datasets.push({
    label: "Patient",
    data: data.map(point => ({ x: point.week, y: point.patient, label: point.weekLabel })),
    borderColor: PATIENT_COLOR, backgroundColor: PATIENT_COLOR,
    borderWidth: 2.5, tension: 0.35, pointRadius: 5,
    pointBackgroundColor: PATIENT_COLOR, pointBorderColor: "#fff", pointBorderWidth: 1.5,
    fill: false, spanGaps: true,
  });

  return datasets;
}

// ─── Chart.js Custom Plugin ──────────────────────────────────────────────────
const percentileLabelsPlugin = {
  id: "percentileLabels",
  afterDraw(chart: any) {
    const { ctx, scales, chartArea } = chart;
    if (!ctx || !chartArea) return;
    const xRight = chartArea.right;
    const xMax: number = scales.x.max;
    const boysItems: { label: string; color: string; x: number; y: number }[] = [];
    const girlsItems: { label: string; color: string; x: number; y: number }[] = [];

    chart.data.datasets.forEach((dataset: any) => {
      if (!dataset.label || dataset.label === "Patient") return;
      const isBoys = dataset.label.startsWith("Boys");
      const parts = dataset.label.split(" ");
      const pctLabel = parts[parts.length - 1];
      const visiblePoints = (dataset.data as any[]).filter((p: any) => p.y !== null && p.y !== undefined && p.x <= xMax);
      if (!visiblePoints.length) return;
      const lastPoint = visiblePoints[visiblePoints.length - 1];
      const rawX = scales.x.getPixelForValue(lastPoint.x);
      const rawY = scales.y.getPixelForValue(lastPoint.y);
      if (!isFinite(rawX) || !isFinite(rawY)) return;
      const item = { label: pctLabel, color: dataset.borderColor, x: Math.min(rawX, xRight - 2), y: rawY };
      if (isBoys) boysItems.push(item); else girlsItems.push(item);
    });

    const resolveCollisions = (items: typeof boysItems) => {
      if (!items.length) return;
      items.sort((a, b) => a.y - b.y);
      const minGap = 12;
      for (let i = 1; i < items.length; i++) {
        if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
      }
      const yBottom = chartArea.bottom - 4;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].y > yBottom) items[i].y = yBottom;
        if (i > 0 && items[i - 1].y > items[i].y - minGap) items[i - 1].y = items[i].y - minGap;
      }
    };

    resolveCollisions(boysItems);
    resolveCollisions(girlsItems);

    ctx.save();
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    [...boysItems, ...girlsItems].forEach(({ label, color, x, y }) => {
      ctx.fillStyle = color;
      ctx.fillText(label, x + 4, y);
    });
    ctx.restore();
  },
};

// ─── MetricChart Sub-Component ───────────────────────────────────────────────
function MetricChart({ data, yLabel, yStep, yMin, genderView, gaAtBirth, chartType, height = 420 }: {
  data: ChartPoint[];
  yLabel: string;
  yStep: number;
  yMin: number;
  genderView: GenderView;
  gaAtBirth: number;
  chartType: ChartType;
  height?: number;
}) {
  const axisColor = genderView === "female" ? "#db2777" : "#2563eb";
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wrapperRef.current) {
      gsap.fromTo(wrapperRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }
      );
    }
  }, [data, genderView]);

  const series = buildSeries(data, genderView);
  const maxVal = Math.max(
    yMin,
    ...data.flatMap(point => [
      point.patient,
      ...(point.boys ? Object.values(point.boys) : []),
      ...(point.girls ? Object.values(point.girls) : []),
    ]).filter((val): val is number => typeof val === "number"),
  );
  const maxY = Math.max(yMin + yStep * 4, ceilTo(maxVal, yStep));

  const chartData: ChartData<"line"> = { datasets: series };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false as const,
    layout: { padding: { left: 20, right: 40 } },
    scales: {
      x: {
        type: "linear" as const,
        min: chartType === "who" ? gaAtBirth : Math.min(gaAtBirth, 40),
        max: gaAtBirth + 260,
        title: {
          display: true,
          text: "Age Milestones",
          color: "#475569",
          font: { size: 12, weight: "bold" as const },
          padding: 10,
        },
        afterBuildTicks: (axis: { ticks: { value: number }[] }) => {
          const customTicks: { value: number }[] = [];
          customTicks.push({ value: gaAtBirth });
          for (let y = 0; y < 5; y++) {
            if (y > 0) customTicks.push({ value: gaAtBirth + y * 52 });
            [2, 4, 6, 8, 10].forEach(m => {
              customTicks.push({ value: gaAtBirth + y * 52 + m * (52 / 12) });
            });
          }
          customTicks.push({ value: gaAtBirth + 5 * 52 });
          axis.ticks = customTicks;
        },
        ticks: {
          color: axisColor,
          autoSkip: false,
          maxRotation: 0,
          font: (context) => {
            const v = Number(context.tick?.value || 0);
            const isYearOrBirth = Math.abs(v - gaAtBirth) < 0.5 || Math.abs((v - gaAtBirth) % 52) < 0.5;
            return {
              size: isYearOrBirth ? 12 : 9.5,
              weight: isYearOrBirth ? ("bold" as const) : ("normal" as const)
            };
          },
          callback: (value: number | string) => {
            const v = Number(value);
            const eps = 0.5;
            if (Math.abs(v - gaAtBirth) < eps) return "Birth";
            if (v > gaAtBirth) {
              const weeksPast = v - gaAtBirth;
              const years = Math.round(weeksPast / 52);
              const months = Math.round((weeksPast % 52) / (52 / 12));
              if (Math.abs(weeksPast - years * 52) < eps) return [`${years}`, "yr"];
              else if ([2, 4, 6, 8, 10].includes(months)) return `${months}`;
            }
            return "";
          },
        },
        grid: { color: "#e2e8f0" },
      },
      y: {
        min: chartType === "who"
          ? (yLabel === "kg" ? 2 : yLabel === "cm" && yStep === 5 ? 35 : 25)
          : yMin,
        max: maxY,
        title: { display: true, text: yLabel, color: "#475569", font: { size: 12, weight: "bold" as const } },
        ticks: { stepSize: yStep, color: axisColor, font: { size: 11 } },
        grid: { color: "#e8ebef" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const raw = items[0]?.raw as { label?: string } | undefined;
            return raw?.label ?? "";
          },
          label: (ctx) => {
            const value = ctx.parsed.y;
            return typeof value === "number"
              ? `${ctx.dataset.label}: ${value.toFixed(1)} ${yLabel}`
              : `${ctx.dataset.label}: —`;
          },
        },
      },
    },
  };

  return (
    <div ref={wrapperRef} style={{ width: "100%", height: height, position: "relative" }}>
      <Line data={chartData} options={options} plugins={[percentileLabelsPlugin]} />
    </div>
  );
}

// ─── Metrics Config ──────────────────────────────────────────────────────────
const METRICS: { key: Metric; label: string; icon: string; yLabel: string; yStep: number; yMin: number }[] = [
  { key: "height", label: "Length / Height", icon: "📏", yLabel: "cm", yStep: 5, yMin: 15 },
  { key: "weight", label: "Weight", icon: "⚖️", yLabel: "kg", yStep: 1, yMin: 0 },
  { key: "headCirc", label: "Head Circumference", icon: "🔵", yLabel: "cm", yStep: 5, yMin: 10 },
  { key: "all", label: "View All", icon: "📊", yLabel: "", yStep: 0, yMin: 0 },
];

export default function GrowchartDetail() {
  const navigate = useNavigate();
  const { patientWho, setPatientWho, homeFormWho, setHomeFormWho } = useGrowchart();

  const [formCollapsed, setFormCollapsed] = useState(false);

  const [chartType, setChartType] = useState<ChartType>(() =>
    (localStorage.getItem("gc_chartType") as ChartType) || "fenton"
  );

  useEffect(() => {
    const checkStorageChange = () => {
      const storedType = localStorage.getItem("gc_chartType") as ChartType;
      if (storedType && storedType !== chartType) setChartType(storedType);
    };
    const interval = setInterval(checkStorageChange, 300);
    window.addEventListener("storage", checkStorageChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", checkStorageChange);
    };
  }, [chartType]);

  // Use WHO context data when in WHO mode, otherwise use localStorage for Fenton
  const [patientName, setPatientName] = useState(() => {
    if (chartType === "who") {
      return homeFormWho.patientName;
    }
    return localStorage.getItem("gc_patientName") || "";
  });
  const [dob, setDob] = useState(() => {
    if (chartType === "who") {
      return homeFormWho.dob;
    }
    return localStorage.getItem("gc_dob") || "";
  });
  const [gender, setGender] = useState<Gender>(() => {
    if (chartType === "who") {
      return homeFormWho.gender;
    }
    return (localStorage.getItem("gc_gender") as Gender) || "";
  });
  const [gaAtBirth, setGaAtBirth] = useState(() => {
    if (chartType === "who") {
      return homeFormWho.gaAtBirth;
    }
    return localStorage.getItem("gc_gaAtBirth") || "40";
  });
  const [visits, setVisits] = useState<Visit[]>(() => {
    if (chartType === "who") {
      return homeFormWho.visits;
    }
    return getStorageItem<Visit[]>("gc_visits", [
      { id: generateId(), date: "", height: "", weight: "", headCirc: "" },
    ]);
  });
  const [activeMetric, setActiveMetric] = useState<Metric>(() => "height");
  const [genderView, setGenderView] = useState<GenderView>(() => "male");

  // Sync form changes to appropriate storage
  useEffect(() => {
    if (chartType === "who") {
      setHomeFormWho({
        patientName,
        dob,
        gender,
        gaAtBirth,
        visits,
        plotted: false,
      });
    } else {
      localStorage.setItem("gc_patientName", patientName);
      localStorage.setItem("gc_dob", dob);
      localStorage.setItem("gc_gender", gender);
      localStorage.setItem("gc_gaAtBirth", gaAtBirth);
      localStorage.setItem("gc_visits", JSON.stringify(visits));
      localStorage.setItem("gc_activeMetric", activeMetric);
      localStorage.setItem("gc_genderView", genderView);
    }
  }, [patientName, dob, gender, gaAtBirth, visits, activeMetric, genderView, chartType, setHomeFormWho]);

  const pageRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const chartCardRef = useRef<HTMLDivElement>(null);
  const tableCardRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(
        [headerRef.current, formCardRef.current, controlsRef.current, chartCardRef.current],
        { opacity: 0, y: 24, duration: 0.55, ease: "power3.out", stagger: 0.1 }
      );
    }, pageRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (tableCardRef.current) {
      const rows = tableCardRef.current.querySelectorAll("tr");
      gsap.fromTo(rows,
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.3, ease: "power2.out", stagger: 0.05 }
      );
    }
  }, [activeMetric]);

  useEffect(() => {
    if (chartCardRef.current) {
      gsap.fromTo(chartCardRef.current,
        { opacity: 0.5, scale: 0.985 },
        { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" }
      );
    }
  }, [activeMetric, genderView, chartType]);

  useEffect(() => {
    if (gender === "male") setGenderView("male");
    else if (gender === "female") setGenderView("female");
    else if (!localStorage.getItem("gc_genderView")) setGenderView("male");
  }, [gender]);

  function animateTab(el: HTMLButtonElement) {
    gsap.timeline()
      .to(el, { scale: 0.9, duration: 0.08 })
      .to(el, { scale: 1.05, duration: 0.15, ease: "power2.out" })
      .to(el, { scale: 1, duration: 0.1 });
  }

  const handleUpdateVisit = (id: string, field: keyof Omit<Visit, "id">, value: string) => {
    setVisits(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleAddVisit = () => {
    const newId = generateId();
    setVisits(prev => [...prev, { id: newId, date: "", height: "", weight: "", headCirc: "" }]);
    setTimeout(() => {
      // The new visit is now the highest-numbered one, displayed first
      // (visit list renders newest-on-top, see visits.map(...).reverse() below).
      const cards = document.querySelectorAll("[data-visit-card]");
      const first = cards[0] as HTMLElement | null;
      if (first) gsap.fromTo(first,
        { opacity: 0, y: 18, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(1.5)", clearProps: "transform" }
      );
    }, 20);
  };

  const handleRemoveVisit = (id: string) => {
    if (visits.length <= 1) return;
    setVisits(prev => prev.filter(v => v.id !== id));
  };

  const handleReset = () => {
    localStorage.removeItem("gc_patientName");
    localStorage.removeItem("gc_dob");
    localStorage.removeItem("gc_gender");
    localStorage.removeItem("gc_gaAtBirth");
    localStorage.removeItem("gc_visits");
    localStorage.removeItem("gc_activeMetric");
    localStorage.removeItem("gc_genderView");

    setPatientName("");
    setDob("");
    setGender("");
    setGaAtBirth("40");
    setVisits([{ id: generateId(), date: "", height: "", weight: "", headCirc: "" }]);
    setActiveMetric("height");
    setGenderView("male");
  };

  const ga = parseFloat(gaAtBirth) || 40;
  const chartData = useMemo(() => buildData(visits, dob, ga, activeMetric, chartType), [visits, dob, ga, activeMetric, chartType]);
  const m = METRICS.find(x => x.key === activeMetric) || METRICS[0];

  const auditRows: PatientPoint[] = useMemo(() => {
    return visits.map((v) => {
      const cga = v.date && dob ? cgaWeek(dob, ga, v.date) : ga;
      const wt = parseFloat(v.weight);
      const ht = parseFloat(v.height);
      const hc = parseFloat(v.headCirc);
      const weight = !isNaN(wt) ? wt : null;
      const height = !isNaN(ht) ? ht : null;
      const headCirc = !isNaN(hc) ? hc : null;
      let bmi: number | null = null;
      if (weight != null && height != null && height > 0) {
        bmi = parseFloat((weight / Math.pow(height / 100, 2)).toFixed(2));
      }
      return {
        week: cga,
        height,
        weight,
        headCirc,
        bmi,
        visitDate: v.date || undefined,
        dob: dob || undefined,
      };
    });
  }, [visits, dob, ga]);

  return (
    <div ref={pageRef} style={s.page}>
      <style>{`
        .layout-responsive-grid {
          display: grid;
          gap: 24px;
          align-items: start;
          grid-template-columns: 1fr;
        }
      `}</style>

      <div style={s.wrapper}>
        <div ref={headerRef} style={s.pageHeader}>
          <div>
            <h1 style={s.title}>{chartType === "who" ? "WHO Growth Reference Charts" : "Fenton Growth Reference Charts"}</h1>
            <p style={s.sub}>
              {patientName && <strong>{patientName} </strong>}
              {gender && (
                <span style={{ color: gender === "male" ? BOYS_COLORS[2] : GIRLS_COLORS[2] }}>
                  {gender === "male" ? "♂ Boy" : "♀ Girl"}
                </span>
              )}
              {gaAtBirth && <span style={{ color: "#64748b" }}> · GA {gaAtBirth}w at birth</span>}
            </p>
          </div>
          <button style={s.backBtn} onClick={() => navigate(-1)}>← Back</button>
        </div>

        <div className="layout-responsive-grid">

          {/* ─── Left Column: Patient Form ─── */}
          <div ref={formCardRef} style={s.formCard}>
            <div style={s.formTitle}>Patient Information</div>

            <div style={s.formGroup}>
              <label style={s.label}>Patient Name</label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Enter patient name"
                style={s.input}
              />
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Gender</label>
              <div style={s.genderOptions}>
                <button
                  type="button"
                  onClick={() => setGender("male")}
                  style={{
                    ...s.genderButton,
                    ...(gender === "male" ? s.genderButtonActive : {}),
                  }}
                >
                  <span style={{ fontSize: 20 }}>♂</span>
                  <span>Male</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGender("female")}
                  style={{
                    ...s.genderButton,
                    ...(gender === "female" ? s.genderButtonActive : {}),
                  }}
                >
                  <span style={{ fontSize: 20 }}>♀</span>
                  <span>Female</span>
                </button>
              </div>
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Date of Birth</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                style={s.input}
              />
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Gestational Age at Birth (weeks)</label>
              <input
                type="number"
                value={gaAtBirth}
                onChange={(e) => setGaAtBirth(e.target.value)}
                placeholder="e.g., 40"
                onWheel={(e) => e.currentTarget.blur()}
                min="22"
                max="44"
                step="0.5"
                style={s.input}
              />
            </div>

            <div style={s.divider} />

            <div style={s.visitsHeader}>
              <h3 style={s.sectionTitle}>Visits</h3>
              <button type="button" onClick={handleAddVisit} style={s.addBtn}>+ Add Visit</button>
            </div>

            <div style={s.visitList}>
              {visits.map((v, i) => ({ v, number: i + 1 })).reverse().map(({ v, number }) => (
                <div key={v.id} style={s.visitCard}>
                  <div style={s.visitCardHeader}>
                    <span style={s.visitLabel}>Visit #{number}</span>
                    {visits.length > 1 && (
                      <button type="button" onClick={() => handleRemoveVisit(v.id)} style={s.removeBtn}>Remove</button>
                    )}
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Date</label>
                    <input
                      type="date"
                      value={v.date}
                      onChange={(e) => handleUpdateVisit(v.id, "date", e.target.value)}
                      style={s.input}
                    />
                  </div>
                  <div style={s.row}>
                    <div style={{ ...s.formGroup, flex: 1 }}>
                      <label style={s.label}>Weight (kg)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={v.weight}
                        onChange={(e) => handleUpdateVisit(v.id, "weight", e.target.value)}
                        style={s.input}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0.00"
                      />
                    </div>
                    <div style={{ ...s.formGroup, flex: 1 }}>
                      <label style={s.label}>Length (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={v.height}
                        onChange={(e) => handleUpdateVisit(v.id, "height", e.target.value)}
                        style={s.input}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0.0"
                      />
                    </div>
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Head Circumference (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={v.headCirc}
                      onChange={(e) => handleUpdateVisit(v.id, "headCirc", e.target.value)}
                      style={s.input}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0.0"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleReset} style={s.resetBtn}>Reset Form</button>
          </div>

          {/* ─── Right Column: Controls, Chart & Table ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* Metric Selection Tabs & Gender Filter Row */}
            <div ref={controlsRef} style={s.controlsRow}>
              <div style={s.tabsGroup}>
                {METRICS.map(item => {
                  const isActive = activeMetric === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={(e) => {
                        setActiveMetric(item.key);
                        animateTab(e.currentTarget);
                      }}
                      style={{ ...s.tabBtn, ...(isActive ? s.activeTabBtn : {}) }}
                    >
                      <span style={{ marginRight: 6 }}>{item.icon}</span>
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {activeMetric !== "all" && (
                <div style={s.genderFilterContainer}>
                  <span style={s.filterLabel}>Reference Dataset:</span>
                  <div style={s.segmentedControl}>
                    {(["male", "female"] as GenderView[]).map(v => {
                      const isActive = genderView === v;
                      return (
                        <button
                          key={v}
                          onClick={() => setGenderView(v)}
                          style={{ ...s.segmentBtn, ...(isActive ? s.activeSegmentBtn : {}) }}
                        >
                          {v === "male" ? "Boys" : "Girls"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Chart Area */}
            <div ref={chartCardRef} style={s.chartCard}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "16px",
                marginBottom: "24px",
                paddingBottom: "16px",
                borderBottom: "1px solid #e2e8f0"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <h3 style={{ ...s.chartTitle, margin: 0 }}>
                    {activeMetric !== "all" ? `${m.label} Percentiles Visualizer` : "All Metrics Visualizer Dashboard"}
                  </h3>
                  <span style={s.badge}>{chartType.toUpperCase()} Standard</span>
                </div>
                <PdfButton
                  wrapperRef={chartCardRef}
                  filename={`${chartType}-${activeMetric}-${(patientName || "patient").toLowerCase().replace(/\s+/g, "-")}.pdf`}
                  heading={`${chartType === "who" ? "WHO" : "Fenton"} Growth Reference Chart (${m.label}) · ${patientName || "Patient"}`}
                />
              </div>

              {activeMetric !== "all" ? (
                <MetricChart
                  data={chartData}
                  yLabel={m.yLabel}
                  yStep={m.yStep}
                  yMin={m.yMin}
                  genderView={genderView}
                  gaAtBirth={ga}
                  chartType={chartType}
                />
              ) : (
                <div style={{ width: "100%" }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "#f8fafc",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    marginBottom: "24px"
                  }}>
                    <span style={{ fontSize: "14px", fontWeight: "bold", color: "#475569" }}>
                      Multi-Chart Reference Standard:
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => setGender("male")}
                        style={{
                          padding: "8px 16px", borderRadius: "6px", border: "1px solid",
                          borderColor: gender === "male" ? "#2563eb" : "#cbd5e1",
                          backgroundColor: gender === "male" ? "#2563eb" : "#ffffff",
                          color: gender === "male" ? "#ffffff" : "#475569",
                          cursor: "pointer", fontWeight: "600", fontSize: "13px",
                          boxShadow: gender === "male" ? "0 2px 4px rgba(37,99,235,0.2)" : "none",
                          transition: "all 0.15s ease"
                        }}
                      >♂ Boys Only</button>
                      <button
                        onClick={() => setGender("female")}
                        style={{
                          padding: "8px 16px", borderRadius: "6px", border: "1px solid",
                          borderColor: gender === "female" ? "#db2777" : "#cbd5e1",
                          backgroundColor: gender === "female" ? "#db2777" : "#ffffff",
                          color: gender === "female" ? "#ffffff" : "#475569",
                          cursor: "pointer", fontWeight: "600", fontSize: "13px",
                          boxShadow: gender === "female" ? "0 2px 4px rgba(219,39,119,0.2)" : "none",
                          transition: "all 0.15s ease"
                        }}
                      >♀ Girls Only</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "24px" }}>
                    {METRICS.filter(x => x.key !== "all").map(mItem => {
                      const singleData = buildData(visits, dob, ga, mItem.key, chartType);
                      return (
                        <div key={mItem.key} style={{
                          ...s.miniChartWrapper,
                          flex: "1 1 calc(50% - 12px)",
                          minWidth: "500px",
                          maxWidth: "100%"
                        }}>
                          <div style={s.chartHeader}>
                            <h4 style={s.miniChartTitle}>{mItem.label} ({mItem.yLabel})</h4>
                          </div>
                          <MetricChart
                            data={singleData}
                            yLabel={mItem.yLabel}
                            yStep={mItem.yStep}
                            yMin={mItem.yMin}
                            genderView={gender === "female" ? "female" : "male"}
                            gaAtBirth={ga}
                            chartType={chartType}
                            height={450}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Historical Audit Table */}
            <div style={s.tableCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ ...s.chartTitle, margin: 0 }}>Historical Audit Logs Summary</h3>
                <AuditExportButtons
                  auditRows={auditRows}
                  baseFilename={`audit-history-${chartType}-${(patientName || "patient").toLowerCase().replace(/\s+/g, "-")}`}
                  patientName={patientName}
                  dob={dob}
                  gaAtBirth={String(ga)}
                />
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr style={s.thRow}>
                      <th style={s.th}># Entry</th>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Chronological Age</th>
                      <th style={s.th}>Post-Menstrual Age (PMA)</th>
                      <th style={s.th}>Weight</th>
                      <th style={s.th}>Length / Height</th>
                      <th style={s.th}>Head Circumference</th>
                    </tr>
                  </thead>
                  <tbody ref={tableCardRef}>
                    {visits.map((v, i) => {
                      const cga = v.date && dob ? cgaWeek(dob, ga, v.date) : null;
                      return (
                        <tr key={v.id} style={s.tr}>
                          <td style={s.td}><strong>{i + 1}</strong></td>
                          <td style={s.td}>{v.date ? formatDate(v.date) : <span style={s.empty}>—</span>}</td>
                          <td style={s.td}>
                            <span style={{ fontWeight: 600, color: "#0f172a" }}>
                              {v.date ? chronologicalAge(dob, v.date) : <span style={s.empty}>—</span>}
                            </span>
                          </td>
                          <td style={s.td}>
                            <span style={{ fontWeight: 600, color: "#2563eb" }}>
                              {cga ? formatPmaReadable(cga) : <span style={s.empty}>—</span>}
                            </span>
                          </td>
                          <td style={s.td}>{v.weight ? `${parseFloat(v.weight).toFixed(2)} kg` : <span style={s.empty}>—</span>}</td>
                          <td style={s.td}>{v.height ? `${parseFloat(v.height).toFixed(1)} cm` : <span style={s.empty}>—</span>}</td>
                          <td style={s.td}>{v.headCirc ? `${parseFloat(v.headCirc).toFixed(1)} cm` : <span style={s.empty}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Styles Dictionary ────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "24px 16px",
  },
  wrapper: {
    maxWidth: "1440px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: "20px 24px",
    borderRadius: "16px",
    boxShadow: "0 1px 3px 0 rgba(0,0,0,0.05), 0 1px 2px -1px rgba(0,0,0,0.05)",
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    letterSpacing: "-0.025em",
    margin: 0,
    color: "#1e293b",
  },
  sub: {
    fontSize: "14px",
    margin: "4px 0 0 0",
    color: "#64748b",
  },
  backBtn: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
    border: "none",
    padding: "8px 14px",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },
  addPatientBtn: {
    padding: "8px 16px",
    backgroundColor: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.03), 0 2px 4px -2px rgba(0,0,0,0.03)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    alignSelf: "start",
  },
  formTitle: {
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
    color: "#0f172a",
  },
  resetBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    padding: "8px 0",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#475569",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    fontSize: "14px",
    transition: "border-color 0.2s",
    width: "100%",
    boxSizing: "border-box",
  },
  genderOptions: {
    display: "flex",
    gap: "12px",
  },
  genderButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#fff",
    fontSize: "14px",
    fontWeight: 500,
    color: "#64748b",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  genderButtonActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
    color: "#3b82f6",
    fontWeight: 600,
  },
  divider: {
    borderTop: "1px solid #e2e8f0",
    margin: "8px 0",
  },
  visitsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  sectionTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
  },
  row: {
    display: "flex",
    gap: "10px",
  },
  collapseBtn: {
    background: "none",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    color: "#475569",
    padding: "4px 8px",
    lineHeight: 1,
    flexShrink: 0,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  select: {
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    color: "#0f172a",
    outline: "none",
    backgroundColor: "#f8fafc",
    cursor: "pointer",
  },
  visitsDivider: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "16px",
    paddingTop: "16px",
    borderTop: "1px solid #f1f5f9",
  },
  visitsTitle: {
    fontSize: "14px",
    fontWeight: 700,
    margin: 0,
    color: "#1e293b",
  },
  addBtn: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  visitList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxHeight: "440px",
    overflowY: "auto",
    paddingRight: "4px",
  },
  visitCard: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  visitCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  visitLabel: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#64748b",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "#dc2626",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  },
  cgaDisplay: {
    padding: "8px 12px",
    backgroundColor: "#eff6ff",
    border: "1px dashed #bfdbfe",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#1e40af",
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
  },
  tabsGroup: {
    display: "flex",
    backgroundColor: "#e2e8f0",
    padding: "4px",
    borderRadius: "10px",
    gap: "2px",
  },
  tabBtn: {
    border: "none",
    background: "none",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#475569",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.15s ease",
  },
  activeTabBtn: {
    backgroundColor: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  genderFilterContainer: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  filterLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#64748b",
  },
  segmentedControl: {
    display: "flex",
    backgroundColor: "#e2e8f0",
    padding: "3px",
    borderRadius: "8px",
  },
  segmentBtn: {
    border: "none",
    background: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#64748b",
    cursor: "pointer",
  },
  activeSegmentBtn: {
    backgroundColor: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  chartCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.03), 0 2px 4px -2px rgba(0,0,0,0.03)",
  },
  chartHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  chartTitle: {
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
    color: "#1e293b",
  },
  badge: {
    backgroundColor: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
    padding: "4px 10px",
    borderRadius: "9999px",
    fontSize: "11px",
    fontWeight: 700,
  },
  miniChartWrapper: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "16px",
  },
  miniChartTitle: {
    fontSize: "14px",
    fontWeight: 700,
    margin: 0,
    color: "#334155",
  },
  tableCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.03), 0 2px 4px -2px rgba(0,0,0,0.03)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
    fontSize: "13px",
  },
  thRow: {
    borderBottom: "2px solid #cbd5e1",
  },
  th: {
    padding: "12px 8px",
    fontWeight: 700,
    color: "#475569",
  },
  tr: {
    borderBottom: "1px solid #f1f5f9",
  },
  td: {
    padding: "12px 8px",
    color: "#334155",
  },
  empty: {
    color: "#94a3b8",
    fontStyle: "italic",
  },
};
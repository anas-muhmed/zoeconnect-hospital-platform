import * as React from "react";
import { useMemo, useState, useRef } from "react";
import { Line } from "react-chartjs-2";
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
  type ChartDataset,
} from "chart.js";
import {
  WHO_WEIGHT_BOYS,
  WHO_WEIGHT_GIRLS,
  WHO_LENGTH_BOYS,
  WHO_LENGTH_GIRLS,
  WHO_HC_BOYS,
  WHO_HC_GIRLS,
  WHO_BMI_BOYS,
  WHO_BMI_GIRLS,
  type RefPoint,
} from "./referenceData";
import { BMID3Chart } from "./BMID3Chart";
import { WHOD3Chart } from "./WHOD3Chart";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, Title);

// ─── PDF helpers ──────────────────────────────────────────────────────────────
export async function downloadChartAsPdf(wrapperEl: HTMLElement, filename: string, heading?: string) {
  const { default: jsPDF } = await import("jspdf");

  const chartCanvas = wrapperEl.querySelector("canvas");
  if (!chartCanvas) return;

  const dpr = window.devicePixelRatio || 1;
  const srcW = chartCanvas.width;
  const srcH = chartCanvas.height;

  // Heading bar height in physical pixels
  const BAR_H = heading ? Math.round(44 * dpr) : 0;

  const offscreen = document.createElement("canvas");
  offscreen.width = srcW;
  offscreen.height = srcH + BAR_H;
  const offCtx = offscreen.getContext("2d")!;

  // White background
  offCtx.fillStyle = "#ffffff";
  offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

  // Heading text + divider
  if (heading && BAR_H > 0) {
    const fontSize = Math.round(15 * dpr);
    offCtx.fillStyle = "#1e293b";
    offCtx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
    offCtx.textAlign = "center";
    offCtx.textBaseline = "middle";
    offCtx.fillText(heading, srcW / 2, BAR_H / 2);
    offCtx.strokeStyle = "#e2e8f0";
    offCtx.lineWidth = dpr;
    offCtx.beginPath();
    offCtx.moveTo(0, BAR_H - dpr);
    offCtx.lineTo(srcW, BAR_H - dpr);
    offCtx.stroke();
  }

  // Chart canvas below heading
  offCtx.drawImage(chartCanvas, 0, BAR_H);

  const imgData = offscreen.toDataURL("image/png", 1.0);
  const ptW = offscreen.width * 0.75;
  const ptH = offscreen.height * 0.75;
  const orientation = ptW > ptH ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [ptW, ptH] });
  pdf.addImage(imgData, "PNG", 0, 0, ptW, ptH, undefined, "FAST");
  pdf.save(filename);
}

if (typeof document !== "undefined" && !document.getElementById("who-pdf-spin")) {
  const st = document.createElement("style");
  st.id = "who-pdf-spin";
  st.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(st);
}

export function PdfButton({ wrapperRef, filename, heading }: { wrapperRef: React.RefObject<HTMLDivElement | null>; filename: string; heading?: string }) {
  const [loading, setLoading] = React.useState(false);
  async function handleClick() {
    if (!wrapperRef.current || loading) return;
    setLoading(true);
    try { await downloadChartAsPdf(wrapperRef.current, filename, heading); }
    catch (err) { console.error("PDF export failed:", err); }
    finally { setLoading(false); }
  }
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        background: "none", border: "none", padding: 0,
        color: loading ? "#94a3b8" : "#0f172a",
        fontSize: 13, fontWeight: 700,
        textDecoration: "underline", textUnderlineOffset: 3,
        cursor: loading ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
        display: "inline-flex", alignItems: "center", gap: 5,
      }}
    >
      {loading ? (
        <>
          <span style={{ display: "inline-block", width: 11, height: 11, border: "2px solid #94a3b8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          Generating…
        </>
      ) : "GET PDF"}
    </button>
  );
}

function formatDobDisplay(dob?: string) {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return dob;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Builds the audit table as a real, native PDF (text + lines), rather than a
// screenshot, since this is structured tabular data — not a chart canvas.
// Patient details are drawn as a header block before the table itself.
async function downloadAuditPdf(
  filename: string,
  auditRows: PatientPoint[],
  patientName?: string,
  dob?: string,
  gaAtBirth?: string
) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 40;
  const contentW = pageW - marginX * 2;
  let y = 50;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor("#0f172a");
  pdf.text("Historical Audit Logs Summary", marginX, y);
  y += 26;

  // ── Patient details header ──────────────────────────────────────────────
  const details: string[] = [];
  if (patientName) details.push(`Patient: ${patientName}`);
  if (dob) details.push(`DOB: ${formatDobDisplay(dob)}`);
  if (gaAtBirth) details.push(`GA at birth: ${gaAtBirth}w`);
  if (details.length) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor("#334155");
    details.forEach((line) => { pdf.text(line, marginX, y); y += 16; });
    y += 8;
  }

  pdf.setDrawColor("#cbd5e1");
  pdf.line(marginX, y, pageW - marginX, y);
  y += 22;

  // ── Column grid: explicit widths that sum exactly to contentW, so the
  // table fills edge-to-edge with no gaps or overlap ─────────────────────
  const colWidths = [30, 75, 75, 80, 75, 85, contentW - (30 + 75 + 75 + 80 + 75 + 85)];
  const colLabels = ["#", "Visit Date", "Chron. Age", "PMA", "Weight", "Length", "Head Circ."];
  const cellPad = 6;
  const colX: number[] = [];
  colWidths.reduce((acc, w, i) => { colX[i] = acc; return acc + w; }, marginX);

  const drawTableHeader = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor("#475569");
    colLabels.forEach((label, i) => pdf.text(label, colX[i] + cellPad, y));
    y += 8;
    pdf.setDrawColor("#94a3b8");
    pdf.setLineWidth(1.2);
    pdf.line(marginX, y, marginX + contentW, y);
    pdf.setLineWidth(0.6);
    y += 18;
  };
  drawTableHeader();

  // ── Rows ─────────────────────────────────────────────────────────────────
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor("#334155");
  const sorted = [...auditRows].sort((a, b) => a.week - b.week);
  const rowH = 22;

  if (sorted.length === 0) {
    pdf.setTextColor("#94a3b8");
    pdf.text("No entries recorded yet.", colX[0] + cellPad, y);
  } else {
    sorted.forEach((p, i) => {
      if (y > pageH - 60) {
        pdf.addPage();
        y = 50;
        drawTableHeader();
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor("#334155");
      }
      const row = [
        String(i + 1),
        p.visitDate ? formatDobDisplay(p.visitDate) : "\u2014",
        chronologicalAge(p.dob ?? dob, p.visitDate),
        formatWeekLabel(p.week),
        p.weight != null ? `${p.weight.toFixed(2)} kg` : "\u2014",
        p.height != null ? `${p.height.toFixed(1)} cm` : "\u2014",
        p.headCirc != null ? `${p.headCirc.toFixed(1)} cm` : "\u2014",
      ];
      row.forEach((text, idx) => pdf.text(text, colX[idx] + cellPad, y));
      // Row separator, matching the on-screen table's thin row dividers
      pdf.setDrawColor("#e2e8f0");
      pdf.line(marginX, y + 7, marginX + contentW, y + 7);
      y += rowH;
    });
  }

  pdf.save(filename);
}

// ─── CSV / Excel export helpers ────────────────────────────────────────────
// Shared row-shaping logic so CSV and Excel export stay in sync with each
// other (and with the PDF audit table above) if the schema ever changes.
interface AuditExportRow {
  entry: number;
  chronAge: string;
  correctedAge: string;
  weightKg: number | null;
  lengthCm: number | null;
  headCircCm: number | null;
  bmi: number | null;
  visitDate: string;
  weightGainGPerDay: number | null;
  weightGainGPerKgPerDay: number | null;
  lengthGainCmPerWeek: number | null;
  headCircGainCmPerMonth: number | null;
}

// Exact calendar days between two ISO visit dates; null if either is
// missing/invalid or the result isn't positive.
function daysBetweenVisits(d1?: string, d2?: string): number | null {
  if (!d1 || !d2) return null;
  const days = Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / (24 * 3600 * 1000));
  return days > 0 ? days : null;
}

function buildAuditExportRows(auditRows: PatientPoint[], fallbackDob?: string): AuditExportRow[] {
  const sorted = [...auditRows].sort((a, b) => a.week - b.week);

  return sorted.map((p, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const days = prev
      ? (daysBetweenVisits(prev.visitDate, p.visitDate) ?? Math.round((p.week - prev.week) * 7))
      : null;

    // Velocity vs. the immediately preceding visit. Weight g/kg/day uses the
    // average of the two visit weights as the denominator (average-weight
    // method), the standard approach for tracking preterm catch-up growth.
    let weightGainGPerDay: number | null = null;
    let weightGainGPerKgPerDay: number | null = null;
    let lengthGainCmPerWeek: number | null = null;
    let headCircGainCmPerMonth: number | null = null;

    if (prev && days && days > 0) {
      if (prev.weight != null && p.weight != null) {
        const gainG = (p.weight - prev.weight) * 1000;
        weightGainGPerDay = parseFloat((gainG / days).toFixed(1));
        const avgWeightKg = (prev.weight + p.weight) / 2;
        weightGainGPerKgPerDay = avgWeightKg > 0 ? parseFloat((gainG / days / avgWeightKg).toFixed(1)) : null;
      }
      if (prev.height != null && p.height != null) {
        lengthGainCmPerWeek = parseFloat(((p.height - prev.height) / (days / 7)).toFixed(2));
      }
      if (prev.headCirc != null && p.headCirc != null) {
        headCircGainCmPerMonth = parseFloat(((p.headCirc - prev.headCirc) / (days / 30.44)).toFixed(2));
      }
    }

    return {
      entry: i + 1,
      chronAge: chronologicalAge(p.dob ?? fallbackDob, p.visitDate),
      correctedAge: p.label ?? formatWeekLabel(p.week),
      weightKg: p.weight ?? null,
      lengthCm: p.height ?? null,
      headCircCm: p.headCirc ?? null,
      bmi: p.bmi ?? null,
      visitDate: p.visitDate ?? "",
      weightGainGPerDay,
      weightGainGPerKgPerDay,
      lengthGainCmPerWeek,
      headCircGainCmPerMonth,
    };
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Escapes a value for CSV: strips embedded newlines (e.g. from multi-line
// week labels) and quotes anything containing a comma or quote character.
function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value).replace(/\r?\n/g, " ").trim();
  if (str.includes(",") || str.includes('"')) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function downloadAuditCsv(
  filename: string,
  auditRows: PatientPoint[],
  patientName?: string,
  dob?: string,
  gaAtBirth?: string
) {
  const rows = buildAuditExportRows(auditRows, dob);

  const headerLines: string[] = [];
  if (patientName) headerLines.push(`Patient,${csvEscape(patientName)}`);
  if (dob) headerLines.push(`DOB,${csvEscape(formatDobDisplay(dob))}`);
  if (gaAtBirth) headerLines.push(`GA at birth,${gaAtBirth}w`);
  if (headerLines.length) headerLines.push("");

  const columns = [
    "#", "Chron. Age", "Post-Menstrual Age (PMA)", "Weight (kg)", "Length/Height (cm)", "Head Circumference (cm)", "BMI (kg/m2)", "Visit Date",
    "Weight Velocity (g/day)", "Weight Velocity (g/kg/day)", "Length Velocity (cm/wk)", "Head Circ. Velocity (cm/mo)",
  ];

  const lines = [
    ...headerLines,
    columns.join(","),
    ...rows.map((r) => [
      r.entry,
      csvEscape(r.chronAge),
      csvEscape(r.correctedAge),
      r.weightKg != null ? r.weightKg.toFixed(2) : "",
      r.lengthCm != null ? r.lengthCm.toFixed(1) : "",
      r.headCircCm != null ? r.headCircCm.toFixed(1) : "",
      r.bmi != null ? r.bmi.toFixed(2) : "",
      csvEscape(r.visitDate),
      r.weightGainGPerDay != null ? r.weightGainGPerDay.toFixed(1) : "",
      r.weightGainGPerKgPerDay != null ? r.weightGainGPerKgPerDay.toFixed(1) : "",
      r.lengthGainCmPerWeek != null ? r.lengthGainCmPerWeek.toFixed(2) : "",
      r.headCircGainCmPerMonth != null ? r.headCircGainCmPerMonth.toFixed(2) : "",
    ].join(",")),
  ];

  // Leading BOM so Excel opens the UTF-8 CSV without mangling special characters.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, filename);
}

async function downloadAuditXlsx(
  filename: string,
  auditRows: PatientPoint[],
  patientName?: string,
  dob?: string,
  gaAtBirth?: string
) {
  const XLSX = await import("xlsx");
  const rows = buildAuditExportRows(auditRows, dob);

  const sheetRows: (string | number)[][] = [];
  if (patientName) sheetRows.push(["Patient", patientName]);
  if (dob) sheetRows.push(["DOB", formatDobDisplay(dob)]);
  if (gaAtBirth) sheetRows.push(["GA at birth", `${gaAtBirth}w`]);
  if (sheetRows.length) sheetRows.push([]);

  sheetRows.push([
    "#", "Chron. Age", "Post-Menstrual Age (PMA)", "Weight (kg)", "Length/Height (cm)", "Head Circumference (cm)", "BMI (kg/m2)", "Visit Date",
    "Weight Velocity (g/day)", "Weight Velocity (g/kg/day)", "Length Velocity (cm/wk)", "Head Circ. Velocity (cm/mo)",
  ]);
  rows.forEach((r) => {
    sheetRows.push([
      r.entry,
      r.chronAge,
      r.correctedAge,
      r.weightKg ?? "",
      r.lengthCm ?? "",
      r.headCircCm ?? "",
      r.bmi ?? "",
      r.visitDate,
      r.weightGainGPerDay ?? "",
      r.weightGainGPerKgPerDay ?? "",
      r.lengthGainCmPerWeek ?? "",
      r.headCircGainCmPerMonth ?? "",
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws["!cols"] = [
    { wch: 6 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 14 },
    { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 20 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Growth Data");
  XLSX.writeFile(wb, filename);
}

function AuditPdfButton({
  auditRows, filename, patientName, dob, gaAtBirth,
}: {
  auditRows: PatientPoint[];
  filename: string;
  patientName?: string;
  dob?: string;
  gaAtBirth?: string;
}) {
  const [loading, setLoading] = React.useState(false);
  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try { await downloadAuditPdf(filename, auditRows, patientName, dob, gaAtBirth); }
    catch (err) { console.error("Audit PDF export failed:", err); }
    finally { setLoading(false); }
  }
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        background: "none", border: "none", padding: 0,
        color: loading ? "#94a3b8" : "#0f172a",
        fontSize: 13, fontWeight: 700,
        textDecoration: "underline", textUnderlineOffset: 3,
        cursor: loading ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
        display: "inline-flex", alignItems: "center", gap: 5,
      }}
    >
      {loading ? (
        <>
          <span style={{ display: "inline-block", width: 11, height: 11, border: "2px solid #94a3b8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          Generating…
        </>
      ) : "GET PDF"}
    </button>
  );
}

// Reusable text-link-style export button (used for CSV/Excel, matching the
// PDF button's look) that runs an arbitrary async export function on click.
function AuditExportLinkButton({ label, loadingLabel, onExport }: { label: string; loadingLabel: string; onExport: () => void | Promise<void> }) {
  const [loading, setLoading] = React.useState(false);
  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try { await onExport(); }
    catch (err) { console.error(`${label} export failed:`, err); }
    finally { setLoading(false); }
  }
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        background: "none", border: "none", padding: 0,
        color: loading ? "#94a3b8" : "#0f172a",
        fontSize: 13, fontWeight: 700,
        textDecoration: "underline", textUnderlineOffset: 3,
        cursor: loading ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
        display: "inline-flex", alignItems: "center", gap: 5,
      }}
    >
      {loading ? (
        <>
          <span style={{ display: "inline-block", width: 11, height: 11, border: "2px solid #94a3b8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          {loadingLabel}
        </>
      ) : label}
    </button>
  );
}

// Groups PDF (visual report), CSV, and Excel (raw data for audit/research)
// export actions together above the audit table.
export function AuditExportButtons({
  auditRows, baseFilename, patientName, dob, gaAtBirth,
}: {
  auditRows: PatientPoint[];
  baseFilename: string;
  patientName?: string;
  dob?: string;
  gaAtBirth?: string;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
      <AuditPdfButton
        auditRows={auditRows}
        filename={`${baseFilename}.pdf`}
        patientName={patientName}
        dob={dob}
        gaAtBirth={gaAtBirth}
      />
      <span style={{ width: 1, height: 14, backgroundColor: "#e2e8f0" }} aria-hidden="true" />
      <AuditExportLinkButton
        label="GET CSV"
        loadingLabel="Exporting…"
        onExport={() => downloadAuditCsv(`${baseFilename}.csv`, auditRows, patientName, dob, gaAtBirth)}
      />
      <span style={{ width: 1, height: 14, backgroundColor: "#e2e8f0" }} aria-hidden="true" />
      <AuditExportLinkButton
        label="GET EXCEL"
        loadingLabel="Exporting…"
        onExport={() => downloadAuditXlsx(`${baseFilename}.xlsx`, auditRows, patientName, dob, gaAtBirth)}
      />
    </div>
  );
}

type Metric = "height" | "weight" | "headCirc" | "bmi";
type GenderView = "both" | "male" | "female";
type Gender = "male" | "female" | "";
type MetricFilter = "all" | Metric;

export interface PatientPoint {
  week: number;
  height: number | null;
  weight: number | null;
  headCirc: number | null;
  bmi: number | null;
  label?: string;
  visitDate?: string;
  dob?: string;
}

export interface WHOChartMiniProps {
  gender: Gender;
  patientData: PatientPoint[];
  allPatientData?: PatientPoint[];
  height?: number;
  patientName?: string;
  dob?: string;
  gaAtBirth?: string;
}

/** Returns postnatal (chronological) age as a readable string, e.g. "3w 2d", "4m 1w" */
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

function formatWeekLabel(week: number) {
  return formatPmaReadable(week);
}

function ceilTo(v: number, step: number) {
  return Math.ceil(v / step) * step;
}

const PERCENTILE_COLORS = ["#e11d48", "#f59e0b", "#15803d", "#f59e0b", "#e11d48"];
const PCTS = ["3rd", "15th", "50th", "85th", "97th"] as const;
const PERCENTILE_KEYS = ["p3", "p15", "p50", "p85", "p97"] as const;
const PATIENT_COLOR = "#111827";

function getRefData(metric: Metric, isMale: boolean): RefPoint[] {
  if (metric === "height") return isMale ? WHO_LENGTH_BOYS : WHO_LENGTH_GIRLS;
  if (metric === "weight") return isMale ? WHO_WEIGHT_BOYS : WHO_WEIGHT_GIRLS;
  if (metric === "bmi") return isMale ? WHO_BMI_BOYS : WHO_BMI_GIRLS;
  return isMale ? WHO_HC_BOYS : WHO_HC_GIRLS;
}

function interpolate(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data || !data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1];
  const lo = sorted.filter((d) => d.x <= x).pop()!;
  const hi = sorted.find((d) => d.x > x)!;
  const t = (x - lo.x) / (hi.x - lo.x);
  const lerp = (a: number, b: number) => parseFloat((a + t * (b - a)).toFixed(2));
  return {
    p3: lerp(lo.p3, hi.p3),
    p15: lerp(lo.p15, hi.p15),
    p50: lerp(lo.p50, hi.p50),
    p85: lerp(lo.p85, hi.p85),
    p97: lerp(lo.p97, hi.p97),
  };
}

const WHO_MAX_WEEK = 40 + 5 * 52;

function buildRefWeeks(): number[] {
  const weeks: number[] = [];
  for (let w = 40; w <= 52; w += 2) weeks.push(w);
  for (let y = 1; y <= 5; y++) {
    const base = 40 + y * 52;
    [base + 8.67, base + 17.33, base + 26, base + 34.67, base + 43.33, base + 52]
      .filter((w) => w <= WHO_MAX_WEEK)
      .forEach((w) => weeks.push(w));
  }
  if (!weeks.includes(WHO_MAX_WEEK)) weeks.push(WHO_MAX_WEEK);
  return weeks;
}

function buildDatasets(
  patientData: PatientPoint[],
  metric: Metric,
  genderView: GenderView
): ChartDataset<"line">[] {
  const refWeeks = buildRefWeeks();
  const showBoys = genderView === "both" || genderView === "male";
  const showGirls = genderView === "both" || genderView === "female";
  const datasets: ChartDataset<"line">[] = [];

  (["male", "female"] as const).forEach((sex) => {
    if (sex === "male" && !showBoys) return;
    if (sex === "female" && !showGirls) return;
    const ref = getRefData(metric, sex === "male");
    PERCENTILE_KEYS.forEach((pKey, idx) => {
      datasets.push({
        label: `${sex === "male" ? "Boys" : "Girls"} ${PCTS[idx]}`,
        data: refWeeks.map((w) => {
          const pt = interpolate(ref, w);
          return { x: w, y: pt?.[pKey] ?? null, label: formatWeekLabel(w) };
        }),
        borderColor: PERCENTILE_COLORS[idx],
        borderWidth: pKey === "p50" ? 2 : 1,
        borderDash: genderView === "both" && sex === "female" ? [4, 3] : [],
        tension: metric === "bmi" ? 0.4 : 0.35,
        cubicInterpolationMode: metric === "bmi" ? "default" : "monotone",
        pointRadius: 0,
        fill: false,
        spanGaps: true,
      } as ChartDataset<"line">);
    });
  });

  const patientPts = patientData
    .filter((p) => {
      if (metric === "height") return p.height != null;
      if (metric === "weight") return p.weight != null;
      if (metric === "bmi") return p.bmi != null;
      return p.headCirc != null;
    })
    .map((p) => {
      const y = metric === "height" ? p.height
        : metric === "weight" ? p.weight
          : metric === "bmi" ? p.bmi
            : p.headCirc;
      return { x: p.week, y, label: p.label ?? formatWeekLabel(p.week) };
    });

  datasets.push({
    label: "Patient",
    data: patientPts,
    borderColor: PATIENT_COLOR,
    backgroundColor: PATIENT_COLOR,
    borderWidth: 2.5,
    tension: 0.35,
    pointRadius: 5,
    pointBackgroundColor: PATIENT_COLOR,
    pointBorderColor: "#fff",
    pointBorderWidth: 1.5,
    fill: false,
    spanGaps: true,
  } as ChartDataset<"line">);

  return datasets;
}

const percentileLabelsPlugin = {
  id: "percentileLabelsMini",
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
      const visiblePoints = (dataset.data as any[]).filter((p: any) => p.y != null && p.x <= xMax);
      if (!visiblePoints.length) return;
      const lastPoint = visiblePoints[visiblePoints.length - 1];
      const rawX = scales.x.getPixelForValue(lastPoint.x);
      const rawY = scales.y.getPixelForValue(lastPoint.y);
      if (!isFinite(rawX) || !isFinite(rawY)) return;
      const item = { label: pctLabel, color: dataset.borderColor, x: Math.min(rawX, xRight - 2), y: rawY };
      (isBoys ? boysItems : girlsItems).push(item);
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

function SingleMetricChart({
  genderView,
  axisColor,
  patientData,
  metric,
  height,
}: {
  genderView: GenderView;
  axisColor: string;
  patientData: PatientPoint[];
  metric: Metric;
  height: number;
}) {
  const chartWrapperRef = React.useRef<HTMLDivElement>(null);
  // Wrapper has a 4px border + 6px padding on each side (border-box), so the
  // child chart's own height must be reduced by that same 20px or its SVG
  // renders taller than the bordered box and spills into neighboring content.
  const chartContentHeight = height - 20;
  const metricLabel =
    metric === "height" ? "length" :
      metric === "weight" ? "weight" :
        metric === "bmi" ? "bmi" : "head-circ";
  const pdfFilename = `who-${metricLabel}-${genderView}.pdf`;
  const metricTitle =
    metric === "height" ? "Length for Age" :
      metric === "weight" ? "Weight for Age" :
        metric === "bmi" ? "BMI for Age" : "Head Circumference for Age";
  const genderTitle = genderView === "male" ? "Boys" : genderView === "female" ? "Girls" : "Boys & Girls";
  const pdfHeading = `${metricTitle} · ${genderTitle}`;
  const posterAccent = genderView === "male" ? "#2563eb" : genderView === "female" ? "#db2777" : "#0f172a";
  const unitLabel = metric === "weight" ? "kg" : metric === "bmi" ? "kg/m\u00B2" : "cm";
  const yStep = metric === "weight" ? 1 : metric === "bmi" ? 1 : 5;
  const yMinResolved = metric === "weight" ? 2 : metric === "height" ? 35 : metric === "bmi" ? 10 : 25;

  const xMax = useMemo(() => {
    if (metric === "bmi") {
      return 40 + 5 * 52; // BMI: term to 5 years (data starts at 40 weeks)
    }
    const weeks = patientData.map((p) => p.week).filter(Number.isFinite);
    return weeks.length ? Math.max(40 + 260, Math.ceil(Math.max(...weeks)) + 4) : 40 + 260;
  }, [patientData, metric]);

  const xMin = useMemo(() => {
    return 40; // All metrics start at term (40 weeks)
  }, []);

  const posterAgeSpan = useMemo(() => {
    const years = Math.floor((xMax - 40) / 52);
    return years >= 1 ? `Birth to ${years} year${years > 1 ? "s" : ""}` : "Birth to 12 months";
  }, [xMax]);

  const datasets = useMemo(
    () => buildDatasets(patientData, metric, genderView),
    [patientData, metric, genderView]
  );

  const chartData: ChartData<"line"> = useMemo(() => ({ datasets }), [datasets]);

  const maxY = useMemo(() => {
    if (metric === "bmi") {
      return 21; // BMI: fixed y-axis range 10-21
    }
    const vals: number[] = [];
    datasets.forEach((ds) => {
      (ds.data as any[]).forEach((pt) => {
        if (typeof pt.y === "number") vals.push(pt.y);
      });
    });
    const maxVal = vals.length ? Math.max(...vals) : yMinResolved + yStep * 4;
    return Math.max(yMinResolved + yStep * 4, ceilTo(maxVal, yStep));
  }, [datasets, yMinResolved, yStep, metric]);

  const options: ChartOptions<"line"> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    layout: { padding: { left: 20, right: 40 } },
    scales: {
      x: {
        type: "linear",
        min: xMin,
        max: xMax,
        title: {
          display: true,
          text: "Age Milestones",
          color: "#475569",
          font: { size: 12, weight: "bold" as const },
          padding: 10,
        },
        afterBuildTicks: (axis: { ticks: { value: number }[] }) => {
          const customTicks: { value: number }[] = [];
          // All metrics: term (40 weeks) to 5 years
          customTicks.push({ value: 40 });
          for (let y = 0; y < 5; y++) {
            if (y > 0) customTicks.push({ value: 40 + y * 52 });
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((m) => {
              customTicks.push({ value: 40 + y * 52 + m * (52 / 12) });
            });
          }
          customTicks.push({ value: 40 + 5 * 52 });
          axis.ticks = customTicks;
        },
        grid: {
          color: (ctx: any) => {
            const v = Number(ctx.tick?.value ?? 0);
            const isYearOrTerm = Math.abs(v - 40) < 0.5 || Math.abs((v - 40) % 52) < 0.5;
            return isYearOrTerm ? "#94a3b8" : "#e2e8f0";
          },
          lineWidth: (ctx: any) => {
            const v = Number(ctx.tick?.value ?? 0);
            const isYearOrTerm = Math.abs(v - 40) < 0.5 || Math.abs((v - 40) % 52) < 0.5;
            return isYearOrTerm ? 1.5 : 1;
          },
        },
        ticks: {
          color: axisColor,
          autoSkip: false,
          maxRotation: 0,
          font: (context: any) => {
            const v = Number(context.tick?.value || 0);
            const isYearOrTerm = Math.abs(v - 40) < 0.5 || Math.abs((v - 40) % 52) < 0.5;
            return {
              size: isYearOrTerm ? 12 : 9.5,
              weight: isYearOrTerm ? ("bold" as const) : ("normal" as const),
            };
          },
          callback: (value: number | string) => {
            const v = Number(value);
            const eps = 0.5;
            if (Math.abs(v - 40) < eps) return "Term";
            if (v > 40) {
              const weeksPast = v - 40;
              const years = Math.round(weeksPast / 52);
              const months = Math.round((weeksPast % 52) / (52 / 12));
              if (Math.abs(weeksPast - years * 52) < eps) return [`${years}`, "yr"];
              else if ([2, 4, 6, 8, 10].includes(months)) return `${months}`;
            }
            return "";
          },
        },
      },
      y: {
        min: yMinResolved,
        max: maxY,
        title: { display: true, text: unitLabel, color: "#475569", font: { size: 12, weight: "bold" as const } },
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
              ? `${ctx.dataset.label}: ${value.toFixed(1)} ${unitLabel}`
              : `${ctx.dataset.label}: —`;
          },
        },
      },
    },
  }), [axisColor, xMax, xMin, yMinResolved, maxY, yStep, unitLabel, metric]);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: posterAccent, letterSpacing: 0.3, textTransform: "uppercase" as const }}>
            {metricTitle.replace(" for Age", "-for-age")} {genderView === "both" ? "Boys & Girls" : genderTitle.toUpperCase()}
          </div>
          <div style={{ height: 2, width: 130, backgroundColor: posterAccent, margin: "4px 0 6px" }} />
          <div style={{ fontSize: 12, color: "#64748b" }}>{posterAgeSpan} (percentiles) · WHO Child Growth Standards</div>
        </div>
        <PdfButton wrapperRef={chartWrapperRef} filename={pdfFilename} heading={pdfHeading} />
      </div>
      <div
        ref={chartWrapperRef}
        style={{
          width: "100%",
          height,
          position: "relative",
          backgroundColor: "#fff",
          border: `4px solid ${posterAccent}`,
          borderRadius: 4,
          padding: 6,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {metric === "bmi" ? (
          <BMID3Chart
            patientData={patientData}
            genderView={genderView}
            height={chartContentHeight}
          />
        ) : (
          <WHOD3Chart
            metric={metric}
            patientData={patientData}
            genderView={genderView}
            height={chartContentHeight}
          />
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  filterBar: {
    display: "flex",
    gap: "6px",
    flexWrap: "nowrap" as const,
    overflowX: "auto" as const,
    overflowY: "hidden" as const,
    marginBottom: 14,
    alignItems: "center",
    width: "100%",
    padding: "2px 0",
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: "#e2e8f0",
    flexShrink: 0,
    margin: "0 2px",
  },
  btn: {
    padding: "6px 14px",
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#fff",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  activeMale: { backgroundColor: "#eff6ff", borderColor: "#2563eb", color: "#2563eb" },
  activeFemale: { backgroundColor: "#fdf2f8", borderColor: "#db2777", color: "#db2777" },
  activeBoth: { backgroundColor: "#f1f5f9", borderColor: "#0f172a", color: "#0f172a" },
  activeMetric: { backgroundColor: "#0f172a", borderColor: "#0f172a", color: "#fff" },
  row: { display: "flex", gap: 16, width: "100%" },
  rowCenter: { display: "flex", justifyContent: "center", width: "100%" },
  tableCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    marginTop: "20px",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.03), 0 2px 4px -2px rgba(0,0,0,0.03)",
  },
  chartHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  patientDetails: {
    display: "flex",
    gap: "20px",
    flexWrap: "wrap" as const,
    fontSize: "13px",
    color: "#334155",
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "10px 14px",
    marginBottom: "16px",
  },
  chartTitle: {
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
    color: "#1e293b",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    textAlign: "left" as const,
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
    fontStyle: "italic" as const,
  },
};

const GENDER_OPTIONS: { key: GenderView; label: string }[] = [
  { key: "male", label: "♂ Boys" },
  { key: "female", label: "♀ Girls" },
  { key: "both", label: "Both" },
];

const METRIC_OPTIONS = [
  { key: "all" as MetricFilter, label: "All" },
  { key: "height" as MetricFilter, label: "Length" },
  { key: "weight" as MetricFilter, label: "Weight" },
  { key: "headCirc" as MetricFilter, label: "Head Circ." },
  { key: "bmi" as MetricFilter, label: "BMI" },
] as const;

export default function WHOChartMini({ gender, patientData, allPatientData, height = 420, patientName, dob, gaAtBirth }: WHOChartMiniProps) {
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("all");
  const [viewGender, setViewGender] = useState<GenderView>(
    gender === "female" ? "female" : gender === "male" ? "male" : "both"
  );

  // Audit table always shows every visit (both Fenton + WHO ranges), even
  // though the charts above only plot the points relevant to this view.
  const auditData = allPatientData ?? patientData;

  const axisColor = viewGender === "female" ? "#db2777" : "#2563eb";

  const hasData = (metric: Metric) =>
    patientData.some((p) =>
      metric === "height" ? p.height != null
        : metric === "weight" ? p.weight != null
          : metric === "bmi" ? p.bmi != null
            : p.headCirc != null
    );

  const showHeight = (metricFilter === "all" || metricFilter === "height") && hasData("height");
  const showWeight = (metricFilter === "all" || metricFilter === "weight") && hasData("weight");
  const showHeadCirc = (metricFilter === "all" || metricFilter === "headCirc") && hasData("headCirc");
  const showBmi = (metricFilter === "all" || metricFilter === "bmi") && hasData("bmi");

  const renderChart = (metric: Metric, widthCap?: string) => (
    <div key={metric} style={{ flex: 1, minWidth: 0, maxWidth: widthCap }}>
      <SingleMetricChart
        genderView={viewGender}
        axisColor={axisColor}
        patientData={patientData}
        metric={metric}
        height={height}
      />
    </div>
  );

  const heightChart = showHeight ? renderChart("height") : null;
  const weightChart = showWeight ? renderChart("weight") : null;
  const headCircChart = showHeadCirc
    ? renderChart("headCirc", metricFilter === "all" ? "50%" : undefined)
    : null;
  const bmiChart = showBmi
    ? renderChart("bmi", metricFilter === "all" ? "50%" : undefined)
    : null;

  // Active style for gender buttons
  const genderActiveStyle = (key: GenderView) => {
    if (viewGender !== key) return {};
    if (key === "male") return styles.activeMale;
    if (key === "female") return styles.activeFemale;
    return styles.activeBoth;
  };

  const hasAnyChart = Boolean(heightChart || weightChart || headCircChart || bmiChart);

  return (
    <div>
      {hasAnyChart && (
        <>
          {/* ── Single unified filter bar ── */}
          <div style={styles.filterBar}>
            {/* Gender toggles */}
            {GENDER_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewGender(key)}
                style={{ ...styles.btn, ...genderActiveStyle(key) }}
              >
                {label}
              </button>
            ))}

            {/* Thin divider between gender and metric groups */}
            <div style={styles.divider} aria-hidden="true" />

            {/* Metric toggles */}
            {METRIC_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMetricFilter(key)}
                style={{
                  ...styles.btn,
                  ...(metricFilter === key ? styles.activeMetric : {}),
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Charts ── */}
          {metricFilter === "all" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {(heightChart || weightChart) && (
                <div style={styles.row}>
                  {heightChart}
                  {weightChart}
                </div>
              )}
              {(headCircChart || bmiChart) && (
                <div style={styles.row}>
                  {headCircChart}
                  {bmiChart}
                </div>
              )}
            </div>
          ) : (
            <div style={{ width: "100%" }}>
              {heightChart || weightChart || headCircChart || bmiChart}
            </div>
          )}
        </>
      )}

      {/* Historical Audit Table */}
      <div style={styles.tableCard}>
        <div style={styles.chartHeader}>
          <h3 style={styles.chartTitle}>Historical Audit Logs Summary</h3>
          <AuditExportButtons
            auditRows={auditData}
            baseFilename={`audit-history-${(patientName || "patient").toLowerCase().replace(/\s+/g, "-")}`}
            patientName={patientName}
            dob={dob}
            gaAtBirth={gaAtBirth}
          />
        </div>

        {(patientName || dob || gaAtBirth) && (
          <div style={styles.patientDetails}>
            {patientName && <span><strong>Patient:</strong> {patientName}</span>}
            {dob && <span><strong>DOB:</strong> {formatDobDisplay(dob)}</span>}
            {gaAtBirth && <span><strong>GA at birth:</strong> {gaAtBirth}w</span>}
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}># Entry</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Chron. Age</th>
                <th style={styles.th}>Post-Menstrual Age (PMA)</th>
                <th style={styles.th}>Weight</th>
                <th style={styles.th}>Length / Height</th>
                <th style={styles.th}>Head Circumference</th>
              </tr>
            </thead>
            <tbody>
              {auditData.length === 0 ? (
                <tr style={styles.tr}>
                  <td style={{ ...styles.td, ...styles.empty }} colSpan={7}>
                    No entries recorded yet.
                  </td>
                </tr>
              ) : (
                [...auditData]
                  .sort((a, b) => a.week - b.week)
                  .map((p, i) => (
                    <tr key={i} style={styles.tr}>
                      <td style={styles.td}><strong>{i + 1}</strong></td>
                      <td style={styles.td}>
                        {p.visitDate ? formatDobDisplay(p.visitDate) : <span style={styles.empty}>—</span>}
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>
                          {chronologicalAge(p.dob ?? auditData.find((x: PatientPoint) => x.visitDate)?.dob, p.visitDate)}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontWeight: 600, color: "#2563eb" }}>
                          {formatWeekLabel(p.week)}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {p.weight != null ? `${p.weight.toFixed(2)} kg` : <span style={styles.empty}>—</span>}
                      </td>
                      <td style={styles.td}>
                        {p.height != null ? `${p.height.toFixed(1)} cm` : <span style={styles.empty}>—</span>}
                      </td>
                      <td style={styles.td}>
                        {p.headCirc != null ? `${p.headCirc.toFixed(1)} cm` : <span style={styles.empty}>—</span>}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
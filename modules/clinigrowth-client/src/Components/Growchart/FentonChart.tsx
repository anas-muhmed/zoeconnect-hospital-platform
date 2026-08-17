import { useRef, useState } from "react";
import CollapsibleSidebar from "./CollapsibleSidebar";
import { FentonD3Chart } from "./FentonD3Chart";

type Gender = "male" | "female" | "";

interface PatientPoint {
  week: number;
  height: number | null;
  weight: number | null;
  headCirc: number | null;
  label?: string;
}

interface FentonChartProps {
  gender: Gender;
  patientData: PatientPoint[];
  splitWeek?: number;
  sidebarContent?: React.ReactNode;
  onSidebarOpen?: () => void;
  alertWeeks?: { week: number; label: string; color: string }[];
}

async function downloadChartAsPdf(wrapperEl: HTMLElement, filename: string) {
  const { default: jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  const canvas = await html2canvas(wrapperEl, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png", 1.0);
  const ptW = canvas.width * 0.75;
  const ptH = canvas.height * 0.75;
  const orientation = ptW > ptH ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [ptW, ptH] });
  pdf.addImage(imgData, "PNG", 0, 0, ptW, ptH, undefined, "FAST");
  pdf.save(filename);
}

function PdfButton({
  wrapperRef,
  filename,
}: {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  filename: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!wrapperRef.current || loading) return;
    setLoading(true);
    try {
      await downloadChartAsPdf(wrapperRef.current, filename);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: loading ? "#94a3b8" : "#0f172a",
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "underline",
        textUnderlineOffset: 3,
        cursor: loading ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {loading ? (
        <>
          <span
            style={{
              display: "inline-block",
              width: 11,
              height: 11,
              border: "2px solid #94a3b8",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          Generating…
        </>
      ) : (
        "GET PDF"
      )}
    </button>
  );
}

if (typeof document !== "undefined" && !document.getElementById("fenton-pdf-spin")) {
  const st = document.createElement("style");
  st.id = "fenton-pdf-spin";
  st.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(st);
}

function ChartPanel({
  gender,
  patientData,
  alertWeeks,
  chartWrapperRef,
}: {
  gender: Gender;
  patientData: PatientPoint[];
  alertWeeks?: FentonChartProps["alertWeeks"];
  chartWrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const showReference = gender === "male" || gender === "female";
  const posterAccent = gender === "male" ? "#2563eb" : gender === "female" ? "#db2777" : "#0f172a";
  const genderTitle = gender === "male" ? "BOYS" : gender === "female" ? "GIRLS" : "";

  return (
    <div ref={chartWrapperRef} style={{ minHeight: 920, backgroundColor: "#fff" }}>
      {!showReference && (
        <p
          style={{
            textAlign: "center",
            color: "#ef4444",
            fontSize: 13,
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          Select a gender to display Fenton reference curves.
        </p>
      )}
      {showReference && (
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: posterAccent,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            Fenton Preterm Growth Chart — {genderTitle}
          </div>
          <div
            style={{
              height: 2,
              width: 160,
              backgroundColor: posterAccent,
              margin: "4px 0 6px",
            }}
          />
          <div style={{ fontSize: 12, color: "#64748b" }}>
            22–50 weeks gestational age · Weight, length & head circumference (3rd–97th percentiles)
          </div>
        </div>
      )}
      <div
        style={{
          border: showReference ? `2px solid ${posterAccent}` : "1px solid #e2e8f0",
          borderRadius: 4,
          padding: 4,
          boxSizing: "border-box",
        }}
      >
        <FentonD3Chart
          gender={gender}
          patientData={patientData}
          height={880}
          alertWeeks={alertWeeks}
        />
      </div>
    </div>
  );
}

export default function FentonChart({
  gender,
  patientData,
  sidebarContent,
  alertWeeks,
}: FentonChartProps) {
  if (gender === "") {
    console.warn("[FentonChart] gender prop is empty.");
  }

  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const pdfFilename = `fenton-${gender || "chart"}.pdf`;

  if (sidebarContent) {
    return (
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", width: "100%" }}>
        <CollapsibleSidebar title="Patient Info" defaultOpen={true}>
          {sidebarContent}
        </CollapsibleSidebar>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <PdfButton wrapperRef={chartWrapperRef} filename={pdfFilename} />
          </div>
          <ChartPanel
            gender={gender}
            patientData={patientData}
            alertWeeks={alertWeeks}
            chartWrapperRef={chartWrapperRef}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <PdfButton wrapperRef={chartWrapperRef} filename={pdfFilename} />
      </div>
      <ChartPanel
        gender={gender}
        patientData={patientData}
        alertWeeks={alertWeeks}
        chartWrapperRef={chartWrapperRef}
      />
    </div>
  );
}

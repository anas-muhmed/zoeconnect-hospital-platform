import * as React from "react";

export interface ChartTooltipData {
  x: number;
  y: number;
  metric: string;
  value: string;
  age: string;
  percentile: string;
  color: string;
  /** Flip the card above the point instead of below, near the top edge. */
  flipAbove?: boolean;
}

/**
 * Small HTML overlay tooltip shared by the Fenton/WHO/BMI D3 charts.
 * Rendered by the parent as a sibling of the chart's <svg>, absolutely
 * positioned against the same wrapper (which must be `position: relative`).
 * Purely a display layer -- it receives already-computed values and does
 * not perform or duplicate any medical calculation itself.
 */
export function ChartTooltip({ data }: { data: ChartTooltipData | null }) {
  return (
    <div
      style={{
        position: "absolute",
        left: data ? data.x : 0,
        top: data ? data.y : 0,
        transform: data
          ? `translate(-50%, ${data.flipAbove ? "0%" : "-100%"}) scale(${data ? 1 : 0.96})`
          : "translate(-50%, -100%) scale(0.96)",
        pointerEvents: "none",
        background: "#1e293b",
        color: "#f8fafc",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 11,
        lineHeight: 1.5,
        boxShadow: "0 4px 12px rgba(15,23,42,0.25)",
        whiteSpace: "nowrap",
        opacity: data ? 1 : 0,
        transition: "opacity 180ms ease, transform 180ms ease",
        zIndex: 20,
      }}
    >
      {data && (
        <>
          <div style={{ fontWeight: 700, marginBottom: 2, color: data.color }}>{data.metric}</div>
          <div>
            <strong>Value:</strong> {data.value}
          </div>
          <div>
            <strong>Age:</strong> {data.age}
          </div>
          <div>
            <strong>Percentile:</strong> {data.percentile}
          </div>
        </>
      )}
    </div>
  );
}

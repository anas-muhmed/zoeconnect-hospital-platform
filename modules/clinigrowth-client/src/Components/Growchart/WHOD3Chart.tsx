import * as React from "react";
import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import {
  WHO_LENGTH_BOYS,
  WHO_LENGTH_GIRLS,
  WHO_WEIGHT_BOYS,
  WHO_WEIGHT_GIRLS,
  WHO_HC_BOYS,
  WHO_HC_GIRLS,
  type RefPoint,
} from "./referenceData";
import { layoutAndDrawLabels, type LabelCandidate } from "./labelLayout";
import { ChartTooltip, type ChartTooltipData } from "./ChartTooltip";

type GenderView = "male" | "female" | "both";
type Metric = "height" | "weight" | "headCirc";

interface PatientPoint {
  week: number;
  height: number | null;
  weight: number | null;
  headCirc: number | null;
}

export interface WHOD3ChartProps {
  metric: Metric;
  patientData: PatientPoint[];
  genderView: GenderView;
  height?: number;
}

const PERCENTILE_KEYS = ["p3", "p15", "p50", "p85", "p97"] as const;
const PERCENTILE_COLORS = ["#e11d48", "#f59e0b", "#15803d", "#f59e0b", "#e11d48"];
const PERCENTILE_LABELS = ["3rd", "15th", "50th", "85th", "97th"];

const WHO_MIN_WEEK = 40;
const WHO_MAX_WEEK = 40 + 5 * 52;

const METRIC_CONFIG = {
  height: {
    boysRef: WHO_LENGTH_BOYS,
    girlsRef: WHO_LENGTH_GIRLS,
    yMin: 40,
    yMax: 120,
    unit: "cm",
    title: "Length/Height (cm)",
  },
  weight: {
    boysRef: WHO_WEIGHT_BOYS,
    girlsRef: WHO_WEIGHT_GIRLS,
    yMin: 0,
    yMax: 30,
    unit: "kg",
    title: "Weight (kg)",
  },
  headCirc: {
    boysRef: WHO_HC_BOYS,
    girlsRef: WHO_HC_GIRLS,
    yMin: 30,
    yMax: 55,
    unit: "cm",
    title: "Head Circumference (cm)",
  },
} as const;

function interpolateRef(ref: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!ref.length) return null;
  const sorted = [...ref].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1];

  const lo = sorted.filter((d) => d.x <= x).pop()!;
  const hi = sorted.find((d) => d.x > x)!;

  const t = (x - lo.x) / (hi.x - lo.x);
  const lerp = (a: number, b: number) => a + t * (b - a);
  return {
    p3: lerp(lo.p3, hi.p3),
    p15: lerp(lo.p15, hi.p15),
    p50: lerp(lo.p50, hi.p50),
    p85: lerp(lo.p85, hi.p85),
    p97: lerp(lo.p97, hi.p97),
  };
}

/** Display-only percentile banding for the hover tooltip -- does not feed
 * back into any plotted geometry, purely a read-out of where the point
 * already sits relative to the drawn curves. */
function classifyBand(pt: Omit<RefPoint, "x">, value: number): string {
  if (value < pt.p3) return "Below 3rd percentile";
  if (value < pt.p15) return "Between 3rd–15th percentile";
  if (value < pt.p50) return "Between 15th–50th percentile";
  if (value < pt.p85) return "Between 50th–85th percentile";
  if (value < pt.p97) return "Between 85th–97th percentile";
  return "Above 97th percentile";
}

function formatAge(weekOfCGA: number): string {
  const monthsFromBirth = ((weekOfCGA - WHO_MIN_WEEK) * 12) / 52;
  if (monthsFromBirth < 1) return `${Math.round(monthsFromBirth * 30.4)} days`;
  if (monthsFromBirth < 24) return `${Math.round(monthsFromBirth)} months`;
  const years = Math.floor(monthsFromBirth / 12);
  const months = Math.round(monthsFromBirth % 12);
  return months === 0 ? `${years} yr` : `${years} yr ${months} mo`;
}

function buildSampleWeeks(): number[] {
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

function isYearTick(week: number): boolean {
  if (Math.abs(week - WHO_MIN_WEEK) < 0.5) return true;
  const past = week - WHO_MIN_WEEK;
  return Math.abs(past % 52) < 0.5 && past > 0;
}

export function WHOD3Chart({ metric, patientData, genderView, height = 500 }: WHOD3ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<ChartTooltipData | null>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current) return;

    const wrapperWidth = containerWidth || wrapperRef.current.clientWidth || 800;
    const margin = { top: 16, right: 52, bottom: 56, left: 52 };
    const innerWidth = wrapperWidth - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const config = METRIC_CONFIG[metric];

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", wrapperWidth).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([WHO_MIN_WEEK, WHO_MAX_WEEK]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([config.yMin, config.yMax]).range([innerHeight, 0]);

    const lineGenerator = d3
      .line<{ x: number; y: number }>()
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y))
      .curve(d3.curveMonotoneX);

    // Y-axis minor grid (every 1 unit)
    g.selectAll(".y-grid-minor")
      .data(d3.range(config.yMin, config.yMax + 1, 1))
      .enter()
      .append("line")
      .attr("class", "y-grid-minor")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d))
      .attr("stroke", "#e8ebef")
      .attr("stroke-width", 0.5);

    // Y-axis major grid (every 5 units)
    g.selectAll(".y-grid-major")
      .data(d3.range(config.yMin, config.yMax + 1, 5))
      .enter()
      .append("line")
      .attr("class", "y-grid-major")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d))
      .attr("stroke", "#d1d5db")
      .attr("stroke-width", 1);

    // X-axis grid — every month
    const xGridValues: number[] = [WHO_MIN_WEEK];
    for (let y = 0; y < 5; y++) {
      if (y > 0) xGridValues.push(WHO_MIN_WEEK + y * 52);
      for (let m = 1; m <= 12; m++) {
        xGridValues.push(WHO_MIN_WEEK + y * 52 + m * (52 / 12));
      }
    }
    xGridValues.push(WHO_MAX_WEEK);

    g.selectAll(".x-grid")
      .data(xGridValues)
      .enter()
      .append("line")
      .attr("class", "x-grid")
      .attr("x1", (d) => xScale(d))
      .attr("x2", (d) => xScale(d))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", (d) => (isYearTick(d) ? "#94a3b8" : "#e8ebef"))
      .attr("stroke-width", (d) => (isYearTick(d) ? 1.5 : 0.75));

    // X-axis month ticks (2, 4, 6, 8, 10 between year marks)
    const monthTicks: { value: number; label: string }[] = [];
    for (let y = 0; y < 5; y++) {
      [2, 4, 6, 8, 10].forEach((m) => {
        const w = WHO_MIN_WEEK + y * 52 + m * (52 / 12);
        if (w < WHO_MAX_WEEK) monthTicks.push({ value: w, label: `${m}` });
      });
    }

    g.selectAll(".x-month-label")
      .data(monthTicks)
      .enter()
      .append("text")
      .attr("class", "x-month-label")
      .attr("x", (d) => xScale(d.value))
      .attr("y", innerHeight + 14)
      .attr("text-anchor", "middle")
      .attr("fill", "#475569")
      .attr("font-size", 9.5)
      .text((d) => d.label);

    // X-axis year / birth labels
    const yearTicks: { value: number; label: string }[] = [{ value: WHO_MIN_WEEK, label: "Birth" }];
    for (let y = 1; y <= 5; y++) {
      yearTicks.push({
        value: WHO_MIN_WEEK + y * 52,
        label: y === 1 ? "1 year" : `${y} years`,
      });
    }

    g.selectAll(".x-year-label")
      .data(yearTicks)
      .enter()
      .append("text")
      .attr("class", "x-year-label")
      .attr("x", (d) => xScale(d.value))
      .attr("y", innerHeight + 28)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 11)
      .attr("font-weight", "bold")
      .text((d) => d.label);

    // Y-axis labels — left and right
    const yTicks = d3.range(config.yMin, config.yMax + 1, 5);
    [innerWidth + 10, -10].forEach((xPos, idx) => {
      g.selectAll(`.y-label-${idx}`)
        .data(yTicks)
        .enter()
        .append("text")
        .attr("class", `y-label-${idx}`)
        .attr("x", xPos)
        .attr("y", (d) => yScale(d))
        .attr("text-anchor", idx === 0 ? "start" : "end")
        .attr("dominant-baseline", "middle")
        .attr("fill", "#475569")
        .attr("font-size", 11)
        .text((d) => d.toString());
    });

    // Axis titles
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 48)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .text("Age (completed months and years)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -38)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .text(config.title);

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", innerWidth + 38)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .text(config.title);

    // Percentile curves
    const labelCandidates: LabelCandidate[] = [];
    const sampleWeeks = buildSampleWeeks();

    (["male", "female"] as const).forEach((sex) => {
      if (sex === "male" && genderView === "female") return;
      if (sex === "female" && genderView === "male") return;

      const ref = sex === "male" ? config.boysRef : config.girlsRef;
      const isDashed = genderView === "both" && sex === "female";

      PERCENTILE_KEYS.forEach((pKey, colorIndex) => {
        const data = sampleWeeks.map((w) => {
          const pt = interpolateRef(ref, w);
          return pt ? { x: w, y: pt[pKey] } : null;
        }).filter((d): d is { x: number; y: number } => d !== null);

        g.append("path")
          .datum(data)
          .attr("d", lineGenerator)
          .attr("fill", "none")
          .attr("stroke", PERCENTILE_COLORS[colorIndex])
          .attr("stroke-width", pKey === "p50" ? 2 : 1.25)
          .attr("stroke-dasharray", isDashed ? "4,3" : "none");

        if (data.length > 0) {
          const last = data[data.length - 1];
          labelCandidates.push({
            id: `pct-${sex}-${pKey}`,
            anchorX: xScale(last.x),
            anchorY: yScale(last.y),
            text: PERCENTILE_LABELS[colorIndex],
            priority: 2,
            fontSize: pKey === "p50" ? 9.5 : 8.5,
            fontWeight: pKey === "p50" ? 600 : "normal",
            color: PERCENTILE_COLORS[colorIndex],
            textAnchor: "start",
            alwaysStem: true,
            preferredOffsets: [{ dx: 5, dy: 0 }],
          });
        }
      });
    });

    layoutAndDrawLabels(
      g,
      labelCandidates,
      { minX: 0, maxX: innerWidth + margin.right - 4, minY: 0, maxY: innerHeight },
      { className: "pct-label-layer" }
    );

    // Patient data points
    const patientValue = metric === "height" ? "height" : metric === "weight" ? "weight" : "headCirc";
    const patientPoints = patientData
      .filter((p) => p[patientValue] != null && p.week <= WHO_MAX_WEEK)
      .sort((a, b) => a.week - b.week);

    // Connecting line for patient points
    if (patientPoints.length > 1) {
      const patientLineGen = d3
        .line<{ week: number; height: number | null; weight: number | null; headCirc: number | null }>()
        .x((d) => xScale(d.week))
        .y((d) => yScale(d[patientValue]!))
        .curve(d3.curveLinear);

      g.append("path")
        .datum(patientPoints)
        .attr("d", patientLineGen)
        .attr("fill", "none")
        .attr("stroke", "#111827")
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", "4,3")
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round");
    }

    // Reference series used to classify the hovered point's percentile band
    // in the tooltip only -- when both sexes are overlaid for comparison,
    // falls back to the boys' curve (display-only, does not affect plotting).
    const classifyRef = genderView === "female" ? config.girlsRef : config.boysRef;

    g.selectAll(".patient-point")
      .data(patientPoints)
      .enter()
      .append("circle")
      .attr("class", "patient-point")
      .attr("cx", (d) => xScale(d.week))
      .attr("cy", (d) => yScale(d[patientValue]!))
      .attr("r", 4.5)
      .attr("fill", "#111827")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("pointerenter", function (_event, d) {
        d3.select(this).attr("r", 6);
        const value = d[patientValue]!;
        const pt = interpolateRef(classifyRef, d.week);
        const cx = margin.left + xScale(d.week);
        const cy = margin.top + yScale(value);
        setTooltip({
          x: cx,
          y: cy,
          metric: config.title,
          value: `${value} ${config.unit}`,
          age: formatAge(d.week),
          percentile: pt ? classifyBand(pt, value) : "—",
          color: "#111827",
          flipAbove: cy < 60,
        });
      })
      .on("pointerleave", function () {
        d3.select(this).attr("r", 4.5);
        setTooltip(null);
      });
  }, [metric, patientData, genderView, height, containerWidth]);

  return (
    <div ref={wrapperRef} style={{ width: "100%", height, position: "relative" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
      <ChartTooltip data={tooltip} />
    </div>
  );
}

import * as d3 from "d3";

/**
 * Shared label-placement engine for the growth charts.
 *
 * Replaces per-chart fixed pixel offsets with real bounding-box collision
 * detection: every label is measured (via getBBox on the live SVG), then
 * placed in priority order by trying a ranked list of candidate positions
 * and taking the first one that doesn't overlap an already-placed label and
 * stays within the chart's bounds. If the local search finds nothing clear,
 * a coarse whitespace scan across the whole chart looks for a genuinely
 * open spot before falling back to the least-bad nearby option, clamped
 * into bounds. A "chip" variant draws a small background behind the text
 * and a permanent stem to its anchor, so patient annotations read as one
 * glued-together unit rather than floating text; other labels get a stem
 * only when displaced far enough that the connection needs reinforcing.
 */

export interface LabelCandidate {
  id: string;
  /** The data point / curve position this label refers to. */
  anchorX: number;
  anchorY: number;
  text: string;
  /** Lower number = higher priority = placed first, keeps its preferred spot. */
  priority: number;
  fontSize: number;
  fontWeight: string | number;
  color: string;
  textAnchor?: "start" | "middle" | "end";
  /** Offsets to try, in order, before falling back to the default search ring. */
  preferredOffsets?: { dx: number; dy: number }[];
  /**
   * "chip" draws a small rounded-rect background (in `color`, low alpha)
   * behind the text and always renders a short stem connecting it to the
   * anchor point, even when the label sits close by -- used for the
   * highest-priority (patient) labels.
   */
  variant?: "chip" | "plain";
  /**
   * Force a leader/stem line even when the label lands within the normal
   * leaderThreshold -- used for curve-name and percentile labels that
   * should always visually tether back to their curve.
   */
  alwaysStem?: boolean;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const PADDING = 3; // enforced gap between placed label boxes, in px
const DEFAULT_BASE_GAP = 12;
// Extends fairly far out so that even a dense cluster of same-priority
// labels (e.g. several visits within days of each other) eventually finds
// genuinely free space -- the leader-line mechanism keeps it traceable
// back to its real data point once it's been pushed that far.
const DEFAULT_RING_MULTIPLIERS = [1, 1.8, 2.6, 3.8, 5.5, 7.5, 10];
const CHIP_PAD_X = 4;
const CHIP_PAD_Y = 2.5;

function boxFor(x: number, y: number, width: number, height: number, anchor: "start" | "middle" | "end"): Box {
  let x0: number, x1: number;
  if (anchor === "start") {
    x0 = x;
    x1 = x + width;
  } else if (anchor === "end") {
    x0 = x - width;
    x1 = x;
  } else {
    x0 = x - width / 2;
    x1 = x + width / 2;
  }
  return { x0, y0: y - height / 2, x1, y1: y + height / 2 };
}

function overlapArea(a: Box, b: Box): number {
  const xOverlap = Math.max(0, Math.min(a.x1 + PADDING, b.x1 + PADDING) - Math.max(a.x0 - PADDING, b.x0 - PADDING));
  const yOverlap = Math.max(0, Math.min(a.y1 + PADDING, b.y1 + PADDING) - Math.max(a.y0 - PADDING, b.y0 - PADDING));
  return xOverlap * yOverlap;
}

function defaultOffsets(baseGap: number): { dx: number; dy: number }[] {
  const offsets: { dx: number; dy: number }[] = [];
  for (const m of DEFAULT_RING_MULTIPLIERS) {
    const gap = baseGap * m;
    offsets.push(
      { dx: 0, dy: -gap }, // above
      { dx: 0, dy: gap }, // below
      { dx: gap, dy: 0 }, // right
      { dx: -gap, dy: 0 }, // left
      { dx: gap, dy: -gap }, // upper-right
      { dx: -gap, dy: -gap }, // upper-left
      { dx: gap, dy: gap }, // lower-right
      { dx: -gap, dy: gap } // lower-left
    );
  }
  return offsets;
}

/** Coarse grid scan of the whole chart for genuinely open whitespace, used
 * when the local search ring around a label's own anchor is exhausted --
 * this is what keeps dense regions from clustering labels that could
 * easily live in empty space elsewhere on the chart. */
function scanForWhitespace(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
  anchor: "start" | "middle" | "end",
  placedBoxes: Box[]
): { x: number; y: number; box: Box; overlap: number } | null {
  const cols = 12;
  const rows = 9;
  let best: { x: number; y: number; box: Box; overlap: number; score: number } | null = null;

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = bounds.minX + ((bounds.maxX - bounds.minX) * c) / cols;
      const y = bounds.minY + ((bounds.maxY - bounds.minY) * r) / rows;
      const box = boxFor(x, y, width, height, anchor);
      if (box.x0 < bounds.minX || box.x1 > bounds.maxX || box.y0 < bounds.minY || box.y1 > bounds.maxY) continue;

      const overlap = placedBoxes.reduce((sum, pb) => sum + overlapArea(box, pb), 0);
      // Among equally-clear spots, prefer the one closest to the label's
      // real data point so whitespace-seeking doesn't fling it needlessly
      // far when a nearer clear spot exists.
      const dist = Math.hypot(x - anchorX, y - anchorY);
      const score = overlap * 1000 + dist;

      if (!best || score < best.score) {
        best = { x, y, box, overlap, score };
      }
    }
  }
  return best;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function layoutAndDrawLabels(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  candidates: LabelCandidate[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  opts: { leaderThreshold?: number; className?: string } = {}
): void {
  if (candidates.length === 0) return;
  const leaderThreshold = opts.leaderThreshold ?? 14;

  // Chips + leaders draw beneath text; all three draw above whatever the
  // chart already appended (curves, gridlines, patient-point circles).
  const layer = g.append("g").attr("class", opts.className ?? "label-layer");
  const leaderLayer = layer.append("g").attr("class", "label-leaders");
  const chipLayer = layer.append("g").attr("class", "label-chips");
  const textLayer = layer.append("g").attr("class", "label-texts");

  // Pass 1: append (invisibly) + measure real bounding boxes.
  const nodes = candidates.map((c) => {
    const anchor = c.textAnchor ?? "middle";
    const el = textLayer
      .append("text")
      .attr("x", c.anchorX)
      .attr("y", c.anchorY)
      .attr("text-anchor", anchor)
      .attr("dominant-baseline", "middle")
      .attr("font-size", c.fontSize)
      .attr("font-weight", c.fontWeight)
      .attr("fill", c.color)
      .attr("opacity", 0)
      .text(c.text);
    const bbox = (el.node() as SVGTextElement).getBBox();
    return { c, el, anchor, width: bbox.width, height: bbox.height };
  });

  // Pass 2: priority-ordered placement (stable sort preserves array order
  // for equal-priority candidates, so e.g. a patient value label placed
  // before another at the same tier keeps that relative preference).
  const order = [...nodes].sort((a, b) => a.c.priority - b.c.priority);
  const placedBoxes: Box[] = [];

  for (const n of order) {
    const { c, anchor, width, height } = n;
    const offsets =
      c.preferredOffsets && c.preferredOffsets.length > 0
        ? [...c.preferredOffsets, ...defaultOffsets(DEFAULT_BASE_GAP)]
        : defaultOffsets(DEFAULT_BASE_GAP);

    let chosen: { x: number; y: number; box: Box } | null = null;
    let bestFallback: { x: number; y: number; box: Box; overlap: number } | null = null;

    for (const { dx, dy } of offsets) {
      const x = c.anchorX + dx;
      const y = c.anchorY + dy;
      const box = boxFor(x, y, width, height, anchor);
      const inBounds = box.x0 >= bounds.minX && box.x1 <= bounds.maxX && box.y0 >= bounds.minY && box.y1 <= bounds.maxY;
      const totalOverlap = placedBoxes.reduce((sum, pb) => sum + overlapArea(box, pb), 0);

      if (inBounds && totalOverlap === 0) {
        chosen = { x, y, box };
        break;
      }
      if (!bestFallback || totalOverlap < bestFallback.overlap) {
        bestFallback = { x, y, box, overlap: totalOverlap };
      }
    }

    // Local ring came up empty-handed (or only found overlapping spots) --
    // before settling for a bad local option, check if genuinely open
    // whitespace exists elsewhere on the chart.
    if (!chosen && (!bestFallback || bestFallback.overlap > 0)) {
      const whitespace = scanForWhitespace(bounds, c.anchorX, c.anchorY, width, height, anchor, placedBoxes);
      if (whitespace && (!bestFallback || whitespace.overlap < bestFallback.overlap)) {
        if (whitespace.overlap === 0) {
          chosen = { x: whitespace.x, y: whitespace.y, box: whitespace.box };
        } else {
          bestFallback = whitespace;
        }
      }
    }

    let finalX: number, finalY: number, finalBox: Box;
    if (chosen) {
      finalX = chosen.x;
      finalY = chosen.y;
      finalBox = chosen.box;
    } else if (bestFallback) {
      // Least-bad option: clamp it into bounds rather than let it escape the chart.
      let { x, y } = bestFallback;
      const box = bestFallback.box;
      const dxClamp = box.x0 < bounds.minX ? bounds.minX - box.x0 : box.x1 > bounds.maxX ? bounds.maxX - box.x1 : 0;
      const dyClamp = box.y0 < bounds.minY ? bounds.minY - box.y0 : box.y1 > bounds.maxY ? bounds.maxY - box.y1 : 0;
      x += dxClamp;
      y += dyClamp;
      finalX = x;
      finalY = y;
      finalBox = boxFor(x, y, width, height, anchor);
    } else {
      finalX = c.anchorX;
      finalY = c.anchorY;
      finalBox = boxFor(finalX, finalY, width, height, anchor);
    }

    placedBoxes.push(finalBox);

    if (c.variant === "chip") {
      chipLayer
        .append("rect")
        .attr("x", finalBox.x0 - CHIP_PAD_X)
        .attr("y", finalBox.y0 - CHIP_PAD_Y)
        .attr("width", finalBox.x1 - finalBox.x0 + CHIP_PAD_X * 2)
        .attr("height", finalBox.y1 - finalBox.y0 + CHIP_PAD_Y * 2)
        .attr("rx", 4)
        .attr("fill", hexToRgba(c.color, 0.1))
        .attr("stroke", c.color)
        .attr("stroke-width", 1);
    }

    n.el.attr("x", finalX).attr("y", finalY).attr("opacity", 1);

    const dist = Math.hypot(finalX - c.anchorX, finalY - c.anchorY);
    const wantsStem = c.variant === "chip" || c.alwaysStem;
    if (dist > leaderThreshold || (wantsStem && dist > 1)) {
      // Stem/leader runs from the anchor to the near edge of the box
      // (not its center), so it reads as "pointing at" the label rather
      // than piercing through its text.
      const cx = Math.max(finalBox.x0, Math.min(finalBox.x1, c.anchorX));
      const cy = Math.max(finalBox.y0, Math.min(finalBox.y1, c.anchorY));
      leaderLayer
        .append("line")
        .attr("x1", c.anchorX)
        .attr("y1", c.anchorY)
        .attr("x2", cx)
        .attr("y2", cy)
        .attr("stroke", c.color)
        .attr("stroke-width", 1)
        .attr("stroke-opacity", wantsStem ? 0.6 : 0.45)
        .attr("stroke-dasharray", dist > leaderThreshold ? "2,2" : "none");
    }
  }
}

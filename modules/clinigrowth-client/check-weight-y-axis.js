
// Let's check the weight values with their mapped Y!
const FENTON_WEIGHT_BOYS = [
  { x: 22, p3: 0.32, p10: 0.37, p50: 0.46, p90: 0.55, p97: 0.62 },
  { x: 24, p3: 0.43, p10: 0.50, p50: 0.62, p90: 0.74, p97: 0.83 },
  { x: 26, p3: 0.58, p10: 0.67, p50: 0.82, p90: 0.98, p97: 1.10 },
  { x: 28, p3: 0.77, p10: 0.89, p50: 1.08, p90: 1.28, p97: 1.43 },
  { x: 30, p3: 1.01, p10: 1.16, p50: 1.40, p90: 1.66, p97: 1.85 },
  { x: 32, p3: 1.30, p10: 1.49, p50: 1.79, p90: 2.10, p97: 2.34 },
  { x: 34, p3: 1.64, p10: 1.88, p50: 2.24, p90: 2.63, p97: 2.92 },
  { x: 36, p3: 2.01, p10: 2.30, p50: 2.73, p90: 3.18, p97: 3.52 },
  { x: 38, p3: 2.38, p10: 2.72, p50: 3.21, p90: 3.73, p97: 4.12 },
  { x: 40, p3: 2.63, p10: 2.99, p50: 3.53, p90: 4.10, p97: 4.53 },
  { x: 42, p3: 2.88, p10: 3.29, p50: 3.88, p90: 4.51, p97: 4.98 },
  { x: 44, p3: 3.10, p10: 3.54, p50: 4.19, p90: 4.89, p97: 5.40 },
  { x: 46, p3: 3.30, p10: 3.78, p50: 4.48, p90: 5.24, p97: 5.90 },
  { x: 48, p3: 3.50, p10: 4.01, p50: 4.77, p90: 5.59, p97: 6.50 },
  { x: 50, p3: 3.68, p10: 4.22, p50: 5.03, p90: 5.90, p97: 7.30 },
];

const FENTON_WEIGHT_GIRLS = [
  { x: 22, p3: 0.30, p10: 0.35, p50: 0.43, p90: 0.52, p97: 0.58 },
  { x: 24, p3: 0.40, p10: 0.47, p50: 0.58, p90: 0.69, p97: 0.77 },
  { x: 26, p3: 0.54, p10: 0.63, p50: 0.77, p90: 0.91, p97: 1.02 },
  { x: 28, p3: 0.72, p10: 0.83, p50: 1.01, p90: 1.20, p97: 1.34 },
  { x: 30, p3: 0.95, p10: 1.09, p50: 1.32, p90: 1.56, p97: 1.74 },
  { x: 32, p3: 1.22, p10: 1.40, p50: 1.69, p90: 1.99, p97: 2.22 },
  { x: 34, p3: 1.54, p10: 1.76, p50: 2.11, p90: 2.48, p97: 2.77 },
  { x: 36, p3: 1.88, p10: 2.15, p50: 2.56, p90: 3.00, p97: 3.34 },
  { x: 38, p3: 2.22, p10: 2.54, p50: 3.01, p90: 3.51, p97: 3.90 },
  { x: 40, p3: 2.46, p10: 2.81, p50: 3.32, p90: 3.87, p97: 4.30 },
  { x: 42, p3: 2.70, p10: 3.09, p50: 3.65, p90: 4.26, p97: 4.73 },
  { x: 44, p3: 2.91, p10: 3.33, p50: 3.95, p90: 4.62, p97: 5.14 },
  { x: 46, p3: 3.10, p10: 3.56, p50: 4.24, p90: 4.97, p97: 5.65 },
  { x: 48, p3: 3.28, p10: 3.77, p50: 4.50, p90: 5.29, p97: 6.25 },
  { x: 50, p3: 3.45, p10: 3.97, p50: 4.74, p90: 5.59, p97: 7.30 },
];

function mapWeightValue(value) {
  return value * 10;
}
function mapCmValue(value) {
  return value + 30;
}

function buildAxisTicks(cmLabelFloor, weightLabelCeil, extendCmTo, extendWeightTo) {
  const raw = [];
  const CM_RAW_MIN = 15;
  const CM_RAW_MAX = 60;
  const WEIGHT_RAW_MAX = 6.5;
  
  // cm labels, descending from top
  const cmTop = Math.max(CM_RAW_MAX, Math.ceil(extendCmTo / 5) * 5);
  for (let v = cmTop; v >= CM_RAW_MIN; v -= 5) {
    raw.push({ value: mapCmValue(v), label: v >= cmLabelFloor ? `${v}` : "" });
  }
  
  // weight labels, ascending from 0
  const weightTop = Math.max(WEIGHT_RAW_MAX, Math.ceil(extendWeightTo * 2) / 2);
  for (let v = 0; v <= weightTop + 0.001; v += 0.5) {
    raw.push({ value: mapWeightValue(v), label: v <= weightLabelCeil + 0.001 ? v.toFixed(1) : "" });
  }
  
  // merge and deduplicate
  const merged = new Map();
  for (const t of raw) {
    const existing = merged.get(t.value);
    if (existing === undefined || existing === "") {
      merged.set(t.value, t.label);
    }
  }
  
  return Array.from(merged, ([value, label]) => ({ value, label }))
              .sort((a, b) => a.value - b.value);
}

function buildYTicks(maxCmNeeded, maxWeightNeeded) {
  return {
    left: buildAxisTicks(15, 4, maxCmNeeded, maxWeightNeeded),
    right: buildAxisTicks(40, 6.5, maxCmNeeded, maxWeightNeeded),
  };
}

console.log("=== FENTON WEIGHT BOYS (kg) with mapped Y ===");
console.log("Week | 3rd (kg) | Y | 10th (kg) | Y | 50th (kg) | Y | 90th (kg) | Y | 97th (kg) | Y");
console.log("----------------------------------------------------------------------------------");
FENTON_WEIGHT_BOYS.forEach(pt => {
  console.log([
    pt.x.toString().padStart(4, " "),
    `${pt.p3.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p3).toFixed(1).padStart(5, " ")}`,
    `${pt.p10.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p10).toFixed(1).padStart(5, " ")}`,
    `${pt.p50.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p50).toFixed(1).padStart(5, " ")}`,
    `${pt.p90.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p90).toFixed(1).padStart(5, " ")}`,
    `${pt.p97.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p97).toFixed(1).padStart(5, " ")}`,
  ].join(" | "));
});

console.log("\n=== FENTON WEIGHT GIRLS (kg) with mapped Y ===");
console.log("Week | 3rd (kg) | Y | 10th (kg) | Y | 50th (kg) | Y | 90th (kg) | Y | 97th (kg) | Y");
console.log("----------------------------------------------------------------------------------");
FENTON_WEIGHT_GIRLS.forEach(pt => {
  console.log([
    pt.x.toString().padStart(4, " "),
    `${pt.p3.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p3).toFixed(1).padStart(5, " ")}`,
    `${pt.p10.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p10).toFixed(1).padStart(5, " ")}`,
    `${pt.p50.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p50).toFixed(1).padStart(5, " ")}`,
    `${pt.p90.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p90).toFixed(1).padStart(5, " ")}`,
    `${pt.p97.toFixed(2).padStart(10, " ")} | ${mapWeightValue(pt.p97).toFixed(1).padStart(5, " ")}`,
  ].join(" | "));
});

console.log("\n=== Y-AXIS TICKS ===");
const ticks = buildYTicks(60, 7.3);
console.log("\nLEFT Y-axis:");
ticks.left.forEach(t => console.log(`  ${t.value.toString().padStart(5, " ")} → "${t.label}"`));
console.log("\nRIGHT Y-axis:");
ticks.right.forEach(t => console.log(`  ${t.value.toString().padStart(5, " ")} → "${t.label}"`));

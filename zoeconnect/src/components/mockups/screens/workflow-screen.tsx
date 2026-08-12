"use client";

const nodes = [
  { label: "Form submitted", x: 8, y: 20 },
  { label: "Route by department", x: 32, y: 12 },
  { label: "Manager approval", x: 56, y: 26 },
  { label: "Sync to system of record", x: 78, y: 14 },
];

const connections = [
  [0, 1],
  [1, 2],
  [2, 3],
];

export function WorkflowScreen() {
  return (
    <div className="relative h-full p-4 text-[11px] text-white/80">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-sm font-semibold text-white">Workflow Builder — Enrollment Approval</p>
        <span className="rounded-full bg-signal-500/15 px-2 py-0.5 text-[9px] font-semibold text-signal-300">
          Draft · Autosaved
        </span>
      </div>
      <div className="relative h-[220px] rounded-lg border border-white/5 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:16px_16px]">
        <svg className="absolute inset-0 h-full w-full">
          {connections.map(([a, b], i) => {
            const from = nodes[a];
            const to = nodes[b];
            return (
              <line
                key={i}
                x1={`${from.x + 8}%`}
                y1={`${from.y + 12}%`}
                x2={`${to.x}%`}
                y2={`${to.y + 12}%`}
                stroke="#e6b45c"
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
            );
          })}
        </svg>
        {nodes.map((n, i) => (
          <div
            key={n.label}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
            className="absolute w-28 rounded-md border border-white/10 bg-slate-900/90 px-2 py-1.5 shadow-lg"
          >
            <p className="text-[9px] uppercase tracking-wide text-white/30">Step 0{i + 1}</p>
            <p className="text-[10px] font-medium text-white/85">{n.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2 text-[9px] text-white/40">
        <span className="rounded-full border border-white/10 px-2 py-1">Trigger: Form submission</span>
        <span className="rounded-full border border-white/10 px-2 py-1">4 steps</span>
        <span className="rounded-full border border-white/10 px-2 py-1">Compliance-logged</span>
      </div>
    </div>
  );
}

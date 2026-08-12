"use client";

const bars = [62, 71, 58, 80, 76, 88, 92];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AnalyticsScreen() {
  return (
    <div className="h-full p-4 text-[11px] text-white/80">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-sm font-semibold text-white">Analytics — Queue &amp; Feedback</p>
        <span className="text-[9px] text-white/40">Last 7 days · All branches</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 rounded-lg border border-white/5 bg-slate-900/60 p-3">
          <p className="mb-3 text-[9px] uppercase tracking-wide text-white/40">Counter throughput</p>
          <div className="flex h-24 items-end gap-2">
            {bars.map((b, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-sm bg-gradient-to-t from-signal-600 to-signal-300"
                  style={{ height: `${b}%` }}
                />
                <span className="text-[8px] text-white/30">{days[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3">
            <p className="text-[9px] uppercase tracking-wide text-white/40">Avg. wait time</p>
            <p className="mt-1 font-display text-lg font-semibold text-white">4m 12s</p>
            <p className="text-[9px] text-emerald-400">-38% since rollout</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-slate-900/60 p-3">
            <p className="text-[9px] uppercase tracking-wide text-white/40">Feedback score</p>
            <p className="mt-1 font-display text-lg font-semibold text-white">4.6 / 5</p>
            <p className="text-[9px] text-emerald-400">1,205 responses</p>
          </div>
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-white/5 bg-slate-900/60 p-3">
        <p className="mb-2 text-[9px] uppercase tracking-wide text-white/40">By department</p>
        <div className="space-y-1.5">
          {[
            { name: "Front Desk", v: 88 },
            { name: "Billing", v: 74 },
            { name: "Records", v: 65 },
          ].map((d) => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="w-16 text-white/50">{d.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-signal-400" style={{ width: `${d.v}%` }} />
              </div>
              <span className="w-8 text-right text-white/40">{d.v}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

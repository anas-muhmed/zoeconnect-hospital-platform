"use client";

import { Ticket, MonitorPlay, MessageSquareHeart, Gift, TrendingUp, Users } from "lucide-react";

const kpis = [
  { label: "Active queues", value: "212", trend: "+6.2%" },
  { label: "Screens online", value: "184/186", trend: "99.0%" },
  { label: "Avg. satisfaction", value: "4.6/5", trend: "+0.1" },
  { label: "Open incidents", value: "3", trend: "-2" },
];

const activity = [
  { icon: Ticket, text: "Counter 4 called token B-014 · Branch 02", time: "2m" },
  { icon: MessageSquareHeart, text: "New 5★ feedback submitted · Branch 07", time: "4m" },
  { icon: MonitorPlay, text: "Signage playlist 'Q3 Promo' published to 42 screens", time: "9m" },
  { icon: Gift, text: "Loyalty tier upgraded for 18 members", time: "14m" },
];

export function DashboardScreen() {
  return (
    <div className="grid h-full grid-cols-[180px_1fr] text-[11px] text-white/80">
      <aside className="hidden flex-col gap-1 border-r border-white/5 bg-slate-900/60 p-3 sm:flex">
        <p className="mb-3 px-2 font-display text-xs font-semibold text-white">ZoeConnect</p>
        {["Overview", "Queue", "Signage", "Feedback", "Loyalty", "Identity"].map((item, i) => (
          <div
            key={item}
            className={`rounded-md px-2 py-1.5 ${i === 0 ? "bg-signal-500/15 text-signal-300" : "text-white/50"}`}
          >
            {item}
          </div>
        ))}
      </aside>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-white">Platform Overview</p>
          <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
            <Users className="h-2.5 w-2.5" /> 9 industries active
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-white/5 bg-slate-900/60 p-2.5">
              <p className="text-[9px] uppercase tracking-wide text-white/40">{k.label}</p>
              <p className="mt-1 font-display text-base font-semibold text-white">{k.value}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[9px] text-signal-300">
                <TrendingUp className="h-2.5 w-2.5" /> {k.trend}
              </p>
            </div>
          ))}
        </div>
        <div className="flex-1 rounded-lg border border-white/5 bg-slate-900/60 p-3">
          <p className="mb-2 text-[9px] uppercase tracking-wide text-white/40">Live activity</p>
          <div className="space-y-2">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-white/5 pb-2 last:border-0">
                <a.icon className="h-3.5 w-3.5 flex-shrink-0 text-signal-300" strokeWidth={1.6} />
                <span className="flex-1 text-white/70">{a.text}</span>
                <span className="text-white/30">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

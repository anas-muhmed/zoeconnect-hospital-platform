"use client";

import { ShieldCheck } from "lucide-react";

const roles = [
  { name: "Branch Administrator", scope: "Full branch access", users: 14 },
  { name: "Counter Staff", scope: "Queue call & serve only", users: 86 },
  { name: "Supervisor", scope: "Queue + feedback + reports", users: 22 },
  { name: "Auditor", scope: "Read-only, full audit trail", users: 5 },
];

export function IdentityScreen() {
  return (
    <div className="h-full p-4 text-[11px] text-white/80">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-sm font-semibold text-white">Identity &amp; Access Control</p>
        <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
          <ShieldCheck className="h-2.5 w-2.5" /> Audit trail: on
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/5">
        <div className="grid grid-cols-[1.4fr_1.6fr_0.6fr] bg-slate-900/80 px-3 py-2 text-[9px] uppercase tracking-wide text-white/40">
          <span>Role</span>
          <span>Scope</span>
          <span className="text-right">Users</span>
        </div>
        {roles.map((r, i) => (
          <div
            key={r.name}
            className={`grid grid-cols-[1.4fr_1.6fr_0.6fr] px-3 py-2.5 ${i % 2 === 0 ? "bg-slate-900/40" : "bg-slate-900/20"}`}
          >
            <span className="font-medium text-white/85">{r.name}</span>
            <span className="text-white/50">{r.scope}</span>
            <span className="text-right text-white/60">{r.users}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] text-white/40">
        <span className="rounded-full border border-white/10 px-2 py-1 text-center">JWT session auth</span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-center">Per-module gating</span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-center">Feature-flag licensing</span>
      </div>
    </div>
  );
}

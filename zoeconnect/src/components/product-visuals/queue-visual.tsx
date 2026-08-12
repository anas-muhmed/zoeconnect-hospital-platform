"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const rows = [
  { id: "A-101", counter: "Counter 1" },
  { id: "A-102", counter: "Counter 2" },
  { id: "A-103", counter: "Counter 3" },
  { id: "B-014", counter: "Counter 1" },
];

const phases = ["Registered", "Counter called", "Shown on display", "Served"] as const;

export function QueueVisual() {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => {
        const next = (p + 1) % phases.length;
        if (next === 0) setActive((v) => (v + 1) % rows.length);
        return next;
      });
    }, 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass-strong w-full max-w-md rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between text-xs text-foreground/40">
        <span className="font-mono uppercase tracking-widest">Live Queue</span>
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="h-1.5 w-1.5 animate-signal-pulse rounded-full bg-emerald-400" /> Real-time
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => {
          const isActive = i === active;
          const status = isActive
            ? phases[phase]
            : i < active
              ? "Served"
              : "Waiting";
          return (
            <motion.div
              key={row.id}
              animate={{ scale: isActive && phase === 1 ? 1.015 : 1 }}
              transition={{ duration: 0.4 }}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors duration-300 ${
                isActive ? "border-accent/50 bg-accent/[0.12]" : "border-border/60 bg-surface/40"
              }`}
            >
              <span className="font-display text-lg font-semibold">{row.id}</span>
              <span className="text-xs text-foreground/50">{row.counter}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  status === "Served"
                    ? "bg-foreground/10 text-foreground/40"
                    : isActive
                      ? "bg-accent/15 text-accent"
                      : "bg-foreground/10 text-foreground/50"
                }`}
              >
                {status}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-2">
        {phases.map((p, i) => (
          <div key={p} className="flex flex-1 items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface/60">
              <motion.div
                animate={{ width: i <= phase ? "100%" : "0%" }}
                transition={{ duration: 0.4 }}
                className="h-full rounded-full bg-accent"
              />
            </div>
          </div>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={phase}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="mt-2 font-mono text-[10px] uppercase tracking-widest text-foreground/40"
        >
          {phases[phase]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const CYCLE_LENGTH = 9;
const OVERRIDE_AT = 9; // trigger emergency override once per full sweep

export function SignageVisual() {
  const [lit, setLit] = useState(0);
  const [tick, setTick] = useState(0);
  const [override, setOverride] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => {
        const next = t + 1;
        if (next % (CYCLE_LENGTH + OVERRIDE_AT) === CYCLE_LENGTH) {
          setOverride(true);
          setTimeout(() => setOverride(false), 1400);
        }
        return next;
      });
      setLit((v) => (v + 1) % 9);
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass-strong w-full max-w-md rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between text-xs text-foreground/40">
        <span className="font-mono uppercase tracking-widest">Screen Network</span>
        <AnimatePresence mode="wait" initial={false}>
          {override ? (
            <motion.span
              key="override"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 font-semibold text-red-400"
            >
              <span className="h-1.5 w-1.5 animate-signal-pulse rounded-full bg-red-400" /> Emergency override pushed
            </motion.span>
          ) : (
            <motion.span key="synced" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-foreground/40">
              9 displays synced
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div
            key={i}
            animate={{
              opacity: override ? 1 : i === lit ? 1 : 0.35,
              borderColor: override ? "rgba(248,113,113,0.7)" : "transparent",
            }}
            transition={{ duration: 0.3 }}
            className="aspect-video rounded-md border border-transparent bg-gradient-to-br from-slate-900 to-slate-800 p-1.5"
          >
            <motion.div
              animate={{
                opacity: override ? 1 : i === lit ? 1 : 0.3,
                backgroundColor: override ? "#f87171" : "#e6b45c",
              }}
              className="h-1 w-2/3 rounded-full"
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

const bars = [
  { label: "5★", value: 62 },
  { label: "4★", value: 24 },
  { label: "3★", value: 8 },
  { label: "2★", value: 4 },
  { label: "1★", value: 2 },
];

export function FeedbackVisual() {
  const [starsFilled, setStarsFilled] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      while (!cancelled) {
        setSubmitted(false);
        for (let s = 0; s <= 5; s++) {
          if (cancelled) return;
          setStarsFilled(s);
          await new Promise((r) => setTimeout(r, 220));
        }
        await new Promise((r) => setTimeout(r, 300));
        setSubmitted(true);
        await new Promise((r) => setTimeout(r, 1600));
        setStarsFilled(0);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="glass-strong w-full max-w-md rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between text-xs text-foreground/40">
        <span className="font-mono uppercase tracking-widest">Live Submission</span>
        <span className="text-foreground/40">QR-linked form</span>
      </div>

      <div className="mb-5 flex items-center justify-center gap-1 rounded-lg border border-border/60 bg-surface/40 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <motion.div key={i} animate={{ scale: i < starsFilled ? 1.15 : 1 }} transition={{ duration: 0.2 }}>
            <Star
              className="h-6 w-6"
              fill={i < starsFilled ? "#e6b45c" : "none"}
              stroke={i < starsFilled ? "#e6b45c" : "currentColor"}
              strokeWidth={1.5}
            />
          </motion.div>
        ))}
      </div>

      <div className="mb-5 flex items-center justify-between text-xs text-foreground/40">
        <span className="font-mono uppercase tracking-widest">Satisfaction</span>
        <motion.span animate={{ opacity: submitted ? 1 : 0.5 }} className="text-foreground/40">
          {submitted ? "1,205 responses" : "1,204 responses"}
        </motion.span>
      </div>
      <div className="space-y-2.5">
        {bars.map((bar, i) => (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="w-6 text-xs text-foreground/50">{bar.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface/60">
              <motion.div
                animate={{ width: `${i === 0 && submitted ? bar.value + 0.4 : bar.value}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full bg-signal-400"
              />
            </div>
            <span className="w-8 text-right text-xs text-foreground/40">{bar.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { industries } from "@/data/content";

export function Industries() {
  const [active, setActive] = useState(0);
  const current = industries[active];

  return (
    <section id="solutions" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 max-w-xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">
            One Platform, Nine Industries
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Healthcare is where it started. It isn't where it stops.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col border-t border-border/60">
            {industries.map((ind, i) => (
              <button
                key={ind.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                className={`group flex items-center justify-between border-b border-border/60 py-4 text-left transition-colors ${
                  active === i ? "text-accent" : "text-foreground/50 hover:text-foreground"
                }`}
              >
                <span className="font-display text-xl font-semibold sm:text-2xl">{ind.name}</span>
                <span className="font-mono text-xs">0{i + 1}</span>
              </button>
            ))}
          </div>

          <div className="relative flex min-h-[280px] flex-col justify-center rounded-2xl border border-border/60 bg-surface/40 p-8 backdrop-blur-xl sm:p-10">
            {/* initial={false}: skip the enter animation for whatever tab
                is showing on first render, so it's visible immediately
                instead of depending on framer-motion hydrating to reach
                opacity 1. Only the tab-to-tab swap still animates. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="font-mono text-xs uppercase tracking-widest text-accent">
                  {current.name}
                </span>
                <p className="mt-4 text-lg leading-relaxed text-foreground/70">{current.blurb}</p>
                <Link
                  href={current.href}
                  className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/80 transition-colors hover:text-accent"
                >
                  Explore {current.name} <ArrowUpRight className="h-4 w-4" />
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

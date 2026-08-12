"use client";

import { motion } from "framer-motion";
import { architectureLayers } from "@/data/content";

const easeOut = [0.16, 1, 0.3, 1] as const;

export function Architecture() {
  return (
    <section className="relative border-y border-border/60 bg-surface/30 py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-20 max-w-xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">
            Platform Stack
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            One stack, whatever system you run beneath it
          </h2>
          <p className="mt-4 text-foreground/60">
            Your system of record stays exactly where it is. ZoeConnect layers
            on top as an Integration &amp; Security Layer, with every module
            built on that same foundation.
          </p>
        </div>

        <div className="relative mx-auto flex max-w-3xl flex-col">
          <div className="absolute bottom-8 left-6 top-8 w-px bg-gradient-to-b from-accent/60 via-border to-transparent sm:left-8" />
          {architectureLayers.map((layer, i) => (
            <motion.div
              key={layer.name}
              initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.7, delay: i * 0.05, ease: easeOut }}
              className="relative mb-4 flex items-center gap-6 pl-16 sm:pl-20"
            >
              <span
                className={`absolute left-0 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border font-mono text-sm sm:h-16 sm:w-16 ${
                  i === 1
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border/60 bg-surface text-foreground/50"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div
                className={`flex-1 rounded-2xl border px-6 py-5 backdrop-blur-xl ${
                  i === 1 ? "border-accent/40 bg-accent/5" : "border-border/60 bg-surface/60"
                }`}
              >
                <h3 className="font-display text-lg font-semibold">{layer.name}</h3>
                <p className="mt-1 text-sm text-foreground/55">{layer.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

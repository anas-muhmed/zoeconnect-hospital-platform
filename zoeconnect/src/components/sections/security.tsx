"use client";

import { motion } from "framer-motion";
import { securityFeatures } from "@/data/content";

const easeOut = [0.16, 1, 0.3, 1] as const;

export function Security() {
  return (
    <section className="relative border-y border-border/60 bg-surface/30 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">
              Security &amp; Governance
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Role-based, audited, independently licensed
            </h2>
            <p className="mt-4 text-foreground/60">
              Security is enforced by the same access-control, audit, and
              licensing modules across every part of the platform — not
              bolted on per module, per industry.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2">
            {securityFeatures.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, delay: i * 0.08, ease: easeOut }}
              >
                <span className="font-display text-3xl font-semibold text-accent/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/60">{f.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

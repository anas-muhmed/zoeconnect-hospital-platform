"use client";

import { motion } from "framer-motion";
import { connectorFacts } from "@/data/content";

const easeOut = [0.16, 1, 0.3, 1] as const;

export function Integrations() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">
              Integration &amp; Security Layer
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              A dedicated Connector, not a direct line into your network
            </h2>
            <p className="mt-4 text-foreground/60">
              ZoeConnect's system-of-record integration runs through a
              standalone Connector service — purpose-built so cloud modules
              never need a direct path into your infrastructure.
            </p>
          </div>

          <div className="flex flex-col divide-y divide-border/60 border-t border-border/60">
            {connectorFacts.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: easeOut }}
                className="grid grid-cols-[auto_1fr] gap-6 py-7"
              >
                <span className="font-mono text-sm text-accent">0{i + 1}</span>
                <div>
                  <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/60">{f.detail}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

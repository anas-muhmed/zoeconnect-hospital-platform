"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { easeSmooth } from "@/lib/utils";

const frictions = [
  { label: "Queues", detail: "Paper tokens, shouted names, no visibility into wait times." },
  { label: "Screens", detail: "The same static loop playing on every display, all day." },
  { label: "Feedback", detail: "Comment cards that get read once a month, if at all." },
];

/**
 * The narrative hinge between "what ZoeConnect is" and "how it works": a
 * short, focused statement of the fragmentation problem every front-line
 * operation shares, regardless of industry. Deliberately brief — this is a
 * transition, not a feature dump.
 */
export function WhyItExists() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const lineScale = useTransform(scrollYProgress, [0.15, 0.55], [0, 1]);

  return (
    <section ref={ref} data-act="why" className="relative overflow-hidden py-32 sm:py-40">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.span
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-6 block font-mono text-xs uppercase tracking-widest text-accent"
        >
          Why ZoeConnect Exists
        </motion.span>

        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: easeSmooth }}
          className="text-balance font-display text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl md:text-5xl"
        >
          Every front-line operation runs the same three broken systems
          <span className="text-foreground/35">
            {" "}
            — a queue nobody can see, a screen nobody updates, and feedback
            nobody reads.
          </span>
        </motion.h2>

        <div className="relative mt-20 grid grid-cols-1 gap-0 sm:grid-cols-3">
          <div className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-border/60 sm:block" />
          <motion.div
            style={{ scaleX: lineScale }}
            className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px origin-left bg-accent sm:block"
          />
          {frictions.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.12, ease: easeSmooth }}
              className="relative pt-10 sm:px-8 sm:first:pl-0 sm:last:pr-0"
            >
              <span className="absolute left-0 top-4 hidden h-3 w-3 -translate-x-1/2 rounded-full border-2 border-accent bg-background sm:block" />
              <p className="font-mono text-xs uppercase tracking-widest text-foreground/40">
                0{i + 1}
              </p>
              <h3 className="mt-2 font-display text-lg font-semibold">{f.label}</h3>
              <p className="mt-2 text-sm text-foreground/60">{f.detail}</p>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-20 max-w-2xl font-display text-xl font-medium text-foreground/80 sm:text-2xl"
        >
          ZoeConnect replaces all three with one connected layer — configured
          per department, per branch, per industry.
        </motion.p>
      </div>
    </section>
  );
}

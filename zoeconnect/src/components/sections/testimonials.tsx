"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { comparisonRows } from "@/data/content";
import { Section } from "@/components/ui/section";
import { fadeUp, staggerContainer } from "@/lib/utils";

export function Testimonials() {
  return (
    <Section
      eyebrow="The ZoeConnect Difference"
      title="Traditional operations vs. ZoeConnect-enabled operations"
    >
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-border/60 backdrop-blur-xl"
      >
        <div className="grid grid-cols-2 border-b border-border/60 bg-surface/70">
          <div className="px-6 py-4 text-sm font-semibold text-foreground/60">Traditional Operations</div>
          <div className="px-6 py-4 text-sm font-semibold text-accent">ZoeConnect-Enabled</div>
        </div>
        {comparisonRows.map((row, i) => (
          <motion.div
            key={row.before}
            custom={i}
            variants={fadeUp}
            className={`grid grid-cols-2 ${i % 2 === 0 ? "bg-surface/40" : "bg-surface/20"}`}
          >
            <div className="flex items-start gap-2.5 px-6 py-4 text-sm text-foreground/60">
              <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground/30" />
              {row.before}
            </div>
            <div className="flex items-start gap-2.5 px-6 py-4 text-sm font-medium">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
              {row.after}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}

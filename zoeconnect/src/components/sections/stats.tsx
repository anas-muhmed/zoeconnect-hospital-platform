"use client";

import { motion } from "framer-motion";
import { platformStats as stats } from "@/data/content";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { staggerContainer, fadeUp } from "@/lib/utils";

export function Stats() {
  return (
    <section className="relative border-y border-border/60 bg-surface/30 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-2 gap-8 lg:grid-cols-4"
        >
          {stats.map((stat, i) => (
            <motion.div key={stat.label} custom={i} variants={fadeUp} className="text-center">
              <p className="font-display text-4xl font-semibold tracking-tight text-gradient sm:text-5xl">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} decimals={stat.value % 1 !== 0 ? 2 : 0} />
              </p>
              <p className="mt-2 text-sm text-foreground/60">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

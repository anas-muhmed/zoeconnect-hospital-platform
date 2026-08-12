"use client";

import { motion, useScroll, useTransform } from "framer-motion";

/**
 * A single, page-long ambient light source fixed behind all sections. Its
 * vertical position tracks scroll progress, so instead of every section
 * introducing its own isolated background treatment, the whole page reads as
 * one continuous lit space that the content passes through.
 */
export function AmbientGlow() {
  const { scrollYProgress } = useScroll();
  const top = useTransform(scrollYProgress, [0, 1], ["-10%", "90%"]);
  const opacity = useTransform(
    scrollYProgress,
    [0, 0.05, 0.95, 1],
    [0.5, 0.9, 0.9, 0.5]
  );

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <motion.div
        style={{ top, opacity }}
        className="absolute left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[160px]"
      />
    </div>
  );
}

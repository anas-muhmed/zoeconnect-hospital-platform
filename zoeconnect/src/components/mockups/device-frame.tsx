"use client";

import { motion } from "framer-motion";

/**
 * A floating laptop-style frame for presenting product mockups as premium
 * showcase renders rather than flat browser screenshots — subtle tilt,
 * depth, and reflection so the screen content reads as a real product.
 */
export function DeviceFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: 8 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1600 }}
      className={`relative mx-auto w-full max-w-3xl ${className}`}
    >
      <div
        style={{ transform: "rotateX(4deg) rotateY(-2deg)", transformStyle: "preserve-3d" }}
        className="relative rounded-[1.4rem] border border-white/10 bg-slate-900 p-2 shadow-[0_60px_120px_-40px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <div className="overflow-hidden rounded-lg bg-slate-950">{children}</div>
      </div>
      {/* base/hinge */}
      <div className="mx-auto h-3 w-[85%] rounded-b-xl bg-gradient-to-b from-slate-800 to-slate-900" />
      <div className="mx-auto h-1.5 w-[40%] rounded-b-md bg-slate-900/80" />
      {/* soft reflection */}
      <div className="pointer-events-none absolute -bottom-16 left-1/2 h-24 w-[70%] -translate-x-1/2 rounded-full bg-black/30 blur-2xl" />
    </motion.div>
  );
}

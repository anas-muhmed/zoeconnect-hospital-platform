"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";

export const ACTS = [
  { id: "what", label: "What It Is" },
  { id: "why", label: "Why It Exists" },
  { id: "how", label: "How It Works" },
  { id: "build", label: "What It Builds" },
  { id: "deploy", label: "How It Deploys" },
  { id: "trust", label: "Why Trust It" },
  { id: "start", label: "Get Started" },
] as const;

export type ActId = (typeof ACTS)[number]["id"];

/**
 * Fixed chapter indicator: shows the current "act" of the product story and a
 * scroll-linked progress thread, giving the page a cinematic, chaptered feel
 * instead of reading as a stack of unrelated sections.
 */
export function ChapterRail() {
  const [active, setActive] = useState<ActId>("what");
  const [visible, setVisible] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 24, mass: 0.3 });
  const dotTop = useTransform(progress, (v) => `${v * 100}%`);

  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sections = ACTS.map((a) => document.querySelector(`[data-act="${a.id}"]`)).filter(
      Boolean
    ) as Element[];

    if (sections.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.act as ActId;
            if (id) setActive(id);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    sections.forEach((s) => observerRef.current?.observe(s));

    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.5);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const activeIndex = Math.max(
    0,
    ACTS.findIndex((a) => a.id === active)
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -12 }}
      transition={{ duration: 0.4 }}
      className="pointer-events-none fixed left-6 top-1/2 z-40 hidden -translate-y-1/2 lg:block xl:left-10"
      aria-hidden="true"
    >
      <div className="flex items-center gap-4">
        <div className="relative h-64 w-px bg-border/50">
          <motion.div
            className="absolute -left-[3px] h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent))]"
            style={{ top: dotTop, translateY: "-50%" }}
          />
        </div>
        <div className="flex flex-col gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/35">
            {String(activeIndex + 1).padStart(2, "0")} / {String(ACTS.length).padStart(2, "0")}
          </span>
          <span className="max-w-[9rem] font-display text-sm font-medium leading-tight text-foreground/70">
            {ACTS[activeIndex]?.label ?? ACTS[0].label}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

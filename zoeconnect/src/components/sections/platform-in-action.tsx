"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DeviceFrame } from "@/components/mockups/device-frame";
import { DashboardScreen } from "@/components/mockups/screens/dashboard-screen";
import { WorkflowScreen } from "@/components/mockups/screens/workflow-screen";
import { AnalyticsScreen } from "@/components/mockups/screens/analytics-screen";
import { IdentityScreen } from "@/components/mockups/screens/identity-screen";
import { easeSmooth } from "@/lib/utils";

const tabs = [
  { id: "dashboard", label: "Dashboard", Screen: DashboardScreen },
  { id: "workflow", label: "Workflow Builder", Screen: WorkflowScreen },
  { id: "analytics", label: "Analytics", Screen: AnalyticsScreen },
  { id: "identity", label: "Identity & Access", Screen: IdentityScreen },
] as const;

const DURATION = 4500;

/**
 * Product showcase renders: the same platform, presented as a single
 * floating device cycling through its real screens, rather than a grid of
 * disconnected feature cards. Each tab shows a screen that could plausibly
 * ship, populated with realistic operational data.
 */
export function PlatformInAction() {
  const [active, setActive] = useState(0);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((v) => (v + 1) % tabs.length);
      setKey((k) => k + 1);
    }, DURATION);
    return () => clearInterval(id);
  }, []);

  const ActiveScreen = tabs[active].Screen;

  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-4 pb-14 text-center sm:px-6">
        <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
          The Platform, In Action
        </span>
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          One interface. Every module underneath it.
        </h2>
      </div>

      <div className="mx-auto mb-10 flex max-w-xl flex-wrap items-center justify-center gap-2 px-4">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            onClick={() => {
              setActive(i);
              setKey((k) => k + 1);
            }}
            className={`relative overflow-hidden rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
              i === active
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-border/60 bg-surface/40 text-foreground/50 hover:text-foreground/80"
            }`}
          >
            {i === active && (
              <motion.span
                key={key}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: DURATION / 1000, ease: "linear" }}
                className="absolute inset-0 origin-left bg-accent/10"
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      <DeviceFrame>
        <div className="aspect-[16/10] w-full">
          {/* initial={false}: the first screen shown shouldn't depend on
              hydration to become visible — only screen-to-screen swaps
              animate. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: easeSmooth }}
              className="h-full w-full"
            >
              <ActiveScreen />
            </motion.div>
          </AnimatePresence>
        </div>
      </DeviceFrame>
    </section>
  );
}

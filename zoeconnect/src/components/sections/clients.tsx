"use client";

import { motion } from "framer-motion";
import { Building2 } from "lucide-react";
import { deploymentProfiles, publishedOutcomes } from "@/data/content";
import { fadeUp, staggerContainer } from "@/lib/utils";

/**
 * No named client logos here by design -- ZoeConnect hasn't shared a public
 * client list for this site, so rather than fabricate logos, this section
 * shows real anonymized deployment profiles and real published outcomes
 * from ZoeConnect's own product materials.
 */
export function Clients() {
  return (
    <section className="relative border-y border-border/60 bg-surface/30 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 max-w-xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">
            Where It Runs Today
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Real deployments, shown without the logos
          </h2>
          <p className="mt-4 text-foreground/60">
            ZoeConnect hasn&apos;t published a client list, so instead of a
            logo wall, here&apos;s what&apos;s actually running in
            production today.
          </p>
        </div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mb-14 grid grid-cols-1 gap-5 sm:grid-cols-3"
        >
          {deploymentProfiles.map((d, i) => (
            <motion.div
              key={d.label}
              custom={i}
              variants={fadeUp}
              className="rounded-2xl border border-border/60 bg-background/60 p-6 backdrop-blur-xl"
            >
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Building2 className="h-4.5 w-4.5" strokeWidth={1.6} />
              </div>
              <h3 className="font-display text-base font-semibold">{d.label}</h3>
              <p className="mt-1 text-xs font-medium text-accent">{d.modules}</p>
              <p className="mt-3 text-sm text-foreground/60">{d.detail}</p>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 gap-6 border-t border-border/60 pt-10 sm:grid-cols-3">
          {publishedOutcomes.map((o) => (
            <div key={o.label} className="text-center sm:text-left">
              <p className="font-display text-3xl font-semibold text-gradient">{o.value}</p>
              <p className="mt-1 text-sm text-foreground/60">{o.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

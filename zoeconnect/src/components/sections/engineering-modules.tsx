"use client";

import { motion } from "framer-motion";
import { Cog, Info } from "lucide-react";
import { otherModules, platformInfrastructure, roadmapModules } from "@/data/content";
import { Section } from "@/components/ui/section";
import { staggerContainer, fadeUp } from "@/lib/utils";

export function EngineeringModules() {
  return (
    <Section
      id="beneath-the-surface"
      eyebrow="The Other Three"
      title="The rest of the six-module platform"
      description="Loyalty, Incident Management, and Program Enrollment & Case Management run on the same Integration & Security Layer as Queue, Content & Signage, and Feedback."
    >
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {otherModules.map((m, i) => (
          <motion.div
            key={m.id}
            custom={i}
            variants={fadeUp}
            className="rounded-2xl border border-border/60 bg-surface/50 p-6 backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Cog className="h-5 w-5" strokeWidth={1.6} />
              </div>
            </div>
            <h3 className="font-display text-lg font-semibold">{m.name}</h3>
            <p className="mt-2 text-sm text-foreground/60">{m.detail}</p>
          </motion.div>
        ))}
      </motion.div>

      <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-border/60 bg-surface/40 p-6 text-center backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground/70">
          <Info className="h-4 w-4 text-accent" /> Underlying platform engineering, not a customer-facing module
        </div>
        <p className="text-sm text-foreground/60">
          {platformInfrastructure.map((p) => p.name).join(" · ")}
        </p>
        <div className="mt-5 border-t border-border/40 pt-5">
          <p className="mb-2 text-sm font-semibold text-foreground/70">On the public roadmap, not yet built</p>
          <p className="text-sm text-foreground/60">{roadmapModules.join(" · ")}</p>
        </div>
      </div>
    </Section>
  );
}

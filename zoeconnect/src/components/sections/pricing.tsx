"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { pricingModel, deploymentModels } from "@/data/content";
import { Section } from "@/components/ui/section";
import { fadeUp, staggerContainer } from "@/lib/utils";

export function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title={pricingModel.headline}
      description={pricingModel.description}
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-5">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="lg:col-span-2"
        >
          <ul className="space-y-4">
            {pricingModel.points.map((point, i) => (
              <motion.li
                key={point}
                custom={i}
                variants={fadeUp}
                className="flex items-start gap-3 rounded-2xl border border-border/60 bg-surface/50 p-4 backdrop-blur-xl"
              >
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                <span className="text-sm text-foreground/70">{point}</span>
              </motion.li>
            ))}
          </ul>
          <Link
            href="/company/contact"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-transform hover:scale-105"
          >
            Talk to sales for a quote
          </Link>
        </motion.div>

        <div className="lg:col-span-3">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-foreground/50">
            Deployment models
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {deploymentModels.map((model) => (
              <div
                key={model.name}
                className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-xl"
              >
                <h3 className="font-display text-base font-semibold">{model.name}</h3>
                <p className="mt-1.5 text-sm text-foreground/60">{model.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

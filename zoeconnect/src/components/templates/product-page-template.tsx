"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { ArrowRight } from "lucide-react";
import type { ProductPageContent } from "@/data/product-pages";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { fadeUp, staggerContainer } from "@/lib/utils";

export function ProductPageTemplate({ content }: { content: ProductPageContent }) {
  const Icon = (Icons as any)[content.icon] ?? Icons.Sparkles;

  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-24">
        <div className="absolute inset-0 -z-10">
          <div className="grid-fade absolute inset-0" />
          <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-signal-500/12 blur-[130px]" />
        </div>
        {/*
          Plain CSS entrance (animate-rise), not framer-motion initial/animate.
          This is above-the-fold hero content for every /products/* page, same
          as the landing page hero: a JS-driven initial={opacity:0} state gets
          server-rendered as-is and only flips visible once framer-motion
          hydrates, which can lag behind first paint (slow network, a cold
          Next.js dev compile). A CSS @keyframes animation is scheduled by the
          browser at paint time regardless of hydration timing, so it can't
          get stuck invisible the same way.
        */}
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mx-auto mb-6 flex h-14 w-14 animate-rise items-center justify-center rounded-2xl bg-gradient-to-br from-signal-500/15 to-signal-300/15 text-accent">
            <Icon className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <div
            className="mb-4 flex animate-rise flex-wrap items-center justify-center gap-2"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
              {content.eyebrow}
            </span>
            {content.status === "live" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live module
              </span>
            )}
            {content.status === "engineering-complete" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Engineering-complete, pre-launch
              </span>
            )}
          </div>
          <h1
            className="text-balance animate-rise font-display text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl"
            style={{ animationDelay: "0.1s" }}
          >
            {content.headline}
          </h1>
          <p
            className="mx-auto mt-6 max-w-2xl animate-rise text-balance text-lg text-foreground/60"
            style={{ animationDelay: "0.18s" }}
          >
            {content.description}
          </p>
          <div
            className="mt-10 flex animate-rise flex-wrap items-center justify-center gap-4"
            style={{ animationDelay: "0.26s" }}
          >
            <Link
              href="/company/contact"
              className="group flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-transform hover:scale-105"
            >
              Request a Demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/products/platform"
              className="rounded-full border border-border/60 bg-surface/50 px-6 py-3.5 text-sm font-semibold backdrop-blur-xl transition-colors hover:border-accent/60 hover:text-accent"
            >
              View Platform Overview
            </Link>
          </div>
        </div>
      </section>

      <Section className="!pt-0" eyebrow="By the numbers">
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
          {content.stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border/60 bg-surface/50 p-6 text-center backdrop-blur-xl">
              <p className="font-display text-3xl font-semibold text-gradient">{s.value}</p>
              <p className="mt-2 text-sm text-foreground/60">{s.label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Capabilities"
        title={`What's inside ${content.name}`}
        description="Every capability shares the same governed data model and security posture as the rest of ZoeConnect."
      >
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2"
        >
          {content.features.map((f, i) => (
            <motion.div key={f.title} custom={i} variants={fadeUp}>
              <GlassCard>
                <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-foreground/60">{f.detail}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      <Section className="!pb-32">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border/60 bg-gradient-to-br from-signal-500/10 to-signal-300/10 p-10 text-center backdrop-blur-xl sm:p-14">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">
            See {content.name} in action
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-foreground/60">
            Get a guided walkthrough mapped to your organization's workflows.
          </p>
          <Link
            href="/company/contact"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-transform hover:scale-105"
          >
            Request a Demo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Section>
    </>
  );
}

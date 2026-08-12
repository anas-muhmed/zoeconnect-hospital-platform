"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { SolutionPageContent } from "@/data/solution-pages";
import { Section } from "@/components/ui/section";
import { fadeUp, staggerContainer } from "@/lib/utils";

export function SolutionPageTemplate({ content }: { content: SolutionPageContent }) {
  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-24">
        <div className="absolute inset-0 -z-10">
          <div className="grid-fade absolute inset-0" />
          <div className="absolute right-1/4 top-0 h-[500px] w-[700px] rounded-full bg-signal-300/12 blur-[130px]" />
        </div>
        {/*
          Plain CSS entrance (animate-rise) rather than framer-motion
          initial/animate — same fix as the landing page hero and the
          product page template. This is above-the-fold content on every
          /solutions/* page; gating its visibility behind JS hydration meant
          it could sit invisible until hydration caught up on a slow load.
        */}
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block animate-rise rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            {content.eyebrow} · {content.name}
          </span>
          <h1
            className="text-balance animate-rise font-display text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl"
            style={{ animationDelay: "0.08s" }}
          >
            {content.headline}
          </h1>
          <p
            className="mx-auto mt-6 max-w-2xl animate-rise text-balance text-lg text-foreground/60"
            style={{ animationDelay: "0.16s" }}
          >
            {content.description}
          </p>
          <div
            className="mt-10 flex animate-rise flex-wrap items-center justify-center gap-4"
            style={{ animationDelay: "0.24s" }}
          >
            <Link
              href="/company/contact"
              className="group flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-transform hover:scale-105"
            >
              Talk to a Specialist
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      <Section
        eyebrow="Built for you"
        title={`How ZoeConnect serves ${content.name}`}
      >
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl space-y-4"
        >
          {content.highlights.map((h, i) => (
            <motion.div
              key={h.title}
              custom={i}
              variants={fadeUp}
              className="flex gap-4 rounded-2xl border border-border/60 bg-surface/50 p-6 backdrop-blur-xl"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
              <div>
                <h3 className="font-display text-lg font-semibold">{h.title}</h3>
                <p className="mt-1 text-sm text-foreground/60">{h.detail}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      <Section className="!pb-32">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border/60 bg-gradient-to-br from-signal-500/10 to-signal-300/10 p-10 text-center backdrop-blur-xl sm:p-14">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">
            Ready to see it built around {content.name.toLowerCase()}?
          </h2>
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

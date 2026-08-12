import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About",
  description: "ZoeConnect is a modular digital service platform for queue management, digital signage, and feedback — configurable across healthcare, enterprise, government, and more.",
};

const values = [
  { title: "Zero Disruption", detail: "Integrates with the system of record you already run — no rip-and-replace, no retraining shock.." },
  { title: "Modular by Design", detail: "Deploy one module or all three. Expand at your own pace, department by department, industry by industry." },
  { title: "Built to Last", detail: "A growing library of modules, engineered ahead of release, ready to activate as your organization's digital strategy matures." },
];

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-24">
        <div className="grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            About ZoeConnect
          </span>
          <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            A modular digital backbone for any front-line operation
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-foreground/60">
            ZoeConnect is a configurable digital service platform designed to
            work alongside whatever system of record your organization already
            runs — not replace it. Each module solves a specific operational
            challenge, from service-counter queuing to digital signage to
            feedback management, and can be deployed independently or as a
            fully integrated suite. It was proven first in healthcare; it's
            built to configure for any industry.
          </p>
        </div>
      </section>

      <Section className="!pt-0">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { value: 6, suffix: "", label: "Modules live today" },
            { value: 9, suffix: "", label: "Configurable industries" },
            { value: 4, suffix: "", label: "Deployment models" },
            { value: 24, suffix: "x7", label: "Live monitoring & support" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-3xl font-semibold text-gradient">
                <AnimatedCounter value={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-sm text-foreground/60">{s.label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="What we believe" title="Our operating principles">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {values.map((v) => (
            <GlassCard key={v.title}>
              <h3 className="font-display text-lg font-semibold">{v.title}</h3>
              <p className="mt-2 text-sm text-foreground/60">{v.detail}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section eyebrow="Where We Come From" title="Built on LifeHIS, by Camerin Innovate">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <Image
            src="/brand/lifehis-logo.png"
            alt="LifeHIS — Hospital Information System"
            width={600}
            height={449}
            className="h-14 w-auto opacity-90"
          />
          <p className="max-w-2xl text-foreground/60">
            ZoeConnect is developed by Camerin Innovate, the team behind
            LifeHIS — a comprehensive, integrated healthcare delivery
            platform used to run hospital administrative and clinical
            operations end to end. ZoeConnect began as LifeHIS's front-line
            service layer — the queuing, signage, and feedback experience
            sitting in front of a hospital's core systems — and has since
            grown into its own configurable Digital Service Platform for
            any industry, while remaining part of the same product family.
          </p>
        </div>
      </Section>
    </>
  );
}

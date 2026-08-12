import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { BookOpen, Rocket, Settings, Shield } from "lucide-react";

export const metadata: Metadata = { title: "Documentation", description: "Guides and references for building on ZoeConnect." };

const docs = [
  { icon: Rocket, title: "Getting Started", detail: "Provision your workspace and connect your first data source in minutes." },
  { icon: Settings, title: "Configuration Guides", detail: "Deep-dive references for workflows, assistants, and integrations." },
  { icon: Shield, title: "Security & Compliance", detail: "Understand ZoeConnect's controls, certifications, and audit exports." },
  { icon: BookOpen, title: "API Reference", detail: "Full REST and GraphQL schema documentation with live examples." },
];

export default function DocumentationPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-16">
        <div className="grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            Resources
          </span>
          <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">Documentation</h1>
          <p className="mx-auto mt-4 max-w-xl text-foreground/60">Everything your team needs to configure, extend, and operate ZoeConnect.</p>
        </div>
      </section>
      <Section className="!pt-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {docs.map((d) => (
            <GlassCard key={d.title}>
              <d.icon className="mb-4 h-8 w-8 text-accent" strokeWidth={1.5} />
              <h3 className="font-display text-lg font-semibold">{d.title}</h3>
              <p className="mt-2 text-sm text-foreground/60">{d.detail}</p>
            </GlassCard>
          ))}
        </div>
      </Section>
    </>
  );
}

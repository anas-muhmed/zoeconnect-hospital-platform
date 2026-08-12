import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog",
  description: "Updates from the ZoeConnect platform team.",
};

export default function BlogPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-16">
        <div className="grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            Blog
          </span>
          <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Notes from the platform team
          </h1>
        </div>
      </section>

      <Section className="!pt-8">
        <div className="mx-auto max-w-xl">
          <GlassCard glow={false} className="text-center">
            <Sparkles className="mx-auto mb-4 h-8 w-8 text-accent" strokeWidth={1.5} />
            <h3 className="font-display text-lg font-semibold">Coming soon</h3>
            <p className="mt-2 text-sm text-foreground/60">
              We're just getting started publishing here. Check back soon for
              updates on Smart Queue & Service Management, Digital Signage,
              Experience Feedback Management, and what's next on the roadmap.
            </p>
          </GlassCard>
        </div>
      </Section>
    </>
  );
}

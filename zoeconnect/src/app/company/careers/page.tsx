import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { ArrowUpRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the team building ZoeConnect's digital service platform.",
};

export default function CareersPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-24">
        <div className="grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            Careers
          </span>
          <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Help us build the platform every industry runs on
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-foreground/60">
            We're building a modular digital service platform — Smart Queue &
            Service Management, Digital Signage, and Experience Feedback
            Management, proven first in healthcare and configured across
            nine industries, with more modules already underway.
          </p>
        </div>
      </section>

      <Section eyebrow="Open Roles" title="Get in touch about opportunities">
        <div className="mx-auto max-w-2xl">
          <GlassCard glow={false} className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-foreground/60">
              We don't have specific open roles listed here yet. If you're interested
              in working on ZoeConnect, reach out and tell us where you'd fit.
            </p>
            <Link
              href="/company/contact"
              className="flex items-center gap-1 rounded-full border border-border/60 px-5 py-2.5 text-sm font-semibold transition-colors hover:border-accent/60 hover:text-accent"
            >
              Contact us <ArrowUpRight className="h-4 w-4" />
            </Link>
          </GlassCard>
        </div>
      </Section>
    </>
  );
}

import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { Download } from "lucide-react";

export const metadata: Metadata = { title: "Downloads", description: "Brochures and module sheets for ZoeConnect." };

const downloads = [
  { title: "ZoeConnect Sales Brochure", type: "PDF" },
  { title: "Platform Overview One-Pager", type: "PDF" },
  { title: "Smart Queue & Service Management Module Sheet", type: "PDF" },
  { title: "Digital Signage & Experience Displays Module Sheet", type: "PDF" },
  { title: "Experience Feedback Management Module Sheet", type: "PDF" },
  { title: "Integration & Security Overview", type: "PDF" },
];

export default function DownloadsPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-16">
        <div className="grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">Resources</span>
          <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">Downloads</h1>
        </div>
      </section>
      <Section className="!pt-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {downloads.map((d) => (
            <GlassCard key={d.title} glow={false} className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{d.title}</p>
                <p className="text-xs text-foreground/50">{d.type} · request from sales</p>
              </div>
              <Download className="h-5 w-5 text-accent" />
            </GlassCard>
          ))}
        </div>
      </Section>
    </>
  );
}

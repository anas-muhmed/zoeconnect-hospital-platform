import type { Metadata } from "next";
import { Section } from "@/components/ui/section";
import { faqs } from "@/data/content";
import { Faq } from "@/components/sections/faq";

export const metadata: Metadata = { title: "Help Center", description: "Answers to common ZoeConnect questions." };

export default function HelpCenterPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-16">
        <div className="grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">Resources</span>
          <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">Help Center</h1>
          <p className="mx-auto mt-4 max-w-xl text-foreground/60">Can't find what you're looking for? Reach out and a specialist will help within one business day.</p>
        </div>
      </section>
      <Faq />
    </>
  );
}

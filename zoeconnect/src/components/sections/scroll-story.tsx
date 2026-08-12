"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Ticket, MonitorPlay, MessageSquareHeart, ShieldCheck } from "lucide-react";

const steps = [
  {
    icon: Ticket,
    title: "Queue",
    body: "Smart Queue & Service Management replaces paper tokens and manual calling with a live, auditable digital queue — department-wise, counter-wise, priority-aware.",
  },
  {
    icon: MonitorPlay,
    title: "Display",
    body: "Digital Signage turns every screen in the building into a branded, always-current touchpoint, synced centrally and resilient offline.",
  },
  {
    icon: MessageSquareHeart,
    title: "Listen",
    body: "Experience Feedback Management captures the voice of the people you serve at every touchpoint, routing happy responses to public reviews and concerns into resolution.",
  },
  {
    icon: ShieldCheck,
    title: "Secure",
    body: "Role-based access and full audit trails run underneath all six modules, integrated with the system of record you already run rather than replacing it.",
  },
];

export function ScrollStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const panels = gsap.utils.toArray<HTMLElement>(".story-panel");
      if (!panelsRef.current || panels.length === 0) return;

      const mm = gsap.matchMedia();

      mm.add("(min-width: 1024px)", () => {
        gsap.to(panels, {
          xPercent: -100 * (panels.length - 1),
          ease: "none",
          scrollTrigger: {
            trigger: containerRef.current,
            pin: true,
            scrub: 1,
            end: () => `+=${(panelsRef.current?.scrollWidth ?? 0) * 1.2}`,
          },
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative overflow-hidden bg-surface/30 py-24 lg:py-0">
      <div className="mx-auto max-w-3xl px-4 pb-12 text-center sm:px-6 lg:pt-24">
        <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
          How it works
        </span>
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          One platform. Six modules. Configured for your industry.
        </h2>
      </div>

      <div
        ref={panelsRef}
        className="flex flex-col gap-8 px-4 lg:h-[70vh] lg:flex-row lg:gap-8 lg:px-[10vw]"
      >
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="story-panel flex w-full flex-shrink-0 flex-col justify-center rounded-3xl border border-border/60 bg-background/60 p-10 backdrop-blur-xl lg:w-[80vw] lg:max-w-3xl"
          >
            <span className="mb-6 text-sm font-mono text-accent">0{i + 1}</span>
            <step.icon className="mb-6 h-12 w-12 text-accent" strokeWidth={1.4} />
            <h3 className="font-display text-2xl font-semibold sm:text-3xl">{step.title}</h3>
            <p className="mt-4 max-w-lg text-base text-foreground/60 sm:text-lg">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

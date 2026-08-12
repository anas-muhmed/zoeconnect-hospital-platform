"use client";

const capabilities = [
  "No disruption to existing systems of record",
  "Modular, phase-wise implementation",
  "Enterprise-grade security & role-based access",
  "Scalable across a single counter or a multi-location network",
  "Cloud, on-premise or hybrid ready",
  "Configurable across nine industries",
];

const doubled = [...capabilities, ...capabilities];

export function LogoMarquee() {
  return (
    <div className="relative overflow-hidden border-y border-border/60 bg-surface/40 py-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />
      <div className="flex w-max animate-marquee gap-3">
        {doubled.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center whitespace-nowrap rounded-full border border-border/50 px-4 py-1.5 text-xs font-medium text-foreground/45"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, Building2, Cloud, Package, ShieldCheck } from "lucide-react";
import { HeroCore } from "@/components/hero/hero-core";
import { MagneticButton } from "@/components/ui/magnetic-button";

const stats = [
  { icon: Package, label: "6 Modules Live" },
  { icon: Building2, label: "9 Industries" },
  { icon: Cloud, label: "On-prem · Hybrid · Cloud" },
  { icon: ShieldCheck, label: "Full Audit Trails" },
];

/**
 * Reveals a line of text word-by-word, each word clipped inside its own
 * overflow-hidden box so it rises into place rather than simply fading.
 *
 * Deliberately plain CSS (`animate-word-rise`), not framer-motion. The
 * whole entrance sequence below runs on CSS `@keyframes` rather than JS
 * `initial`/`animate` props: a CSS animation is scheduled by the browser
 * the moment the element paints, so it plays on schedule even if client-side
 * hydration is slow — which it visibly can be on a Next.js dev server's
 * first (cold) compile of a page. A JS-driven entrance would render its
 * `initial` state in the server HTML and then just sit there, invisible,
 * until hydration catches up and fires the animation; a CSS one doesn't
 * have that dependency at all.
 */
function RevealWords({ text, delayStart = 0 }: { text: string; delayStart?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        // Gap comes from margin, not a trailing space character — a space
        // glyph inside these overflow-hidden, negative-tracking boxes was
        // getting swallowed, running every word together.
        <span
          key={i}
          className={`inline-block overflow-hidden pb-1 align-bottom ${i < words.length - 1 ? "mr-[0.22em]" : ""}`}
        >
          <span
            className="inline-block animate-word-rise"
            style={{ animationDelay: `${delayStart + i * 0.045}s` }}
          >
            {word}
          </span>
        </span>
      ))}
    </>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-24 sm:pt-36 lg:pt-40 lg:pb-32">
      <div className="absolute inset-0 -z-10">
        <div className="diagonal-fade absolute inset-0" />
        <div className="grid-fade animate-grid-drift absolute inset-0 opacity-60" />
        <div className="absolute -left-32 top-24 h-[420px] w-[420px] rounded-full bg-signal-500/10 blur-[130px]" />
        <div className="absolute right-[-10%] bottom-[-10%] h-[380px] w-[380px] rounded-full bg-accent/[0.06] blur-[130px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="mb-6 inline-flex animate-rise items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-4 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-signal-pulse rounded-full bg-accent" />
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
                ZoeConnect · Digital Service Platform
              </span>
            </div>

            <h1 className="text-balance font-display text-5xl font-bold leading-[1.05] tracking-tightest sm:text-6xl md:text-[4.2rem]">
              <RevealWords text="Built to run" delayStart={0.1} />
              <br />
              <RevealWords text="what matters" delayStart={0.35} />
              <span className="text-accent">.</span>
            </h1>

            <span
              className="mt-5 block h-1 w-0 animate-draw-underline rounded-full bg-accent"
              style={{ animationDelay: "0.85s" }}
            />

            <p
              className="mt-6 max-w-md animate-rise text-pretty text-lg leading-relaxed text-foreground/60"
              style={{ animationDelay: "0.95s" }}
            >
              Configurable queue, signage, and feedback modules — proven in
              healthcare, built for any front-line operation.
            </p>

            <div
              className="mt-10 flex animate-rise flex-wrap items-center gap-x-6 gap-y-4"
              style={{ animationDelay: "1.05s" }}
            >
              <MagneticButton as={Link} href="/company/contact">
                <span className="group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition-shadow hover:shadow-accent/30">
                  Request a demo
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </MagneticButton>
              <Link
                href="#solutions"
                className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground/50 transition-colors hover:text-foreground"
              >
                See it in your industry
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div
              className="mt-14 grid animate-rise grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4"
              style={{ animationDelay: "1.2s" }}
            >
              {stats.map(({ icon: Icon, label }) => (
                <div key={label}>
                  <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface/40 text-accent">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <p className="text-xs text-foreground/50">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <HeroCore />
        </div>
      </div>
    </section>
  );
}

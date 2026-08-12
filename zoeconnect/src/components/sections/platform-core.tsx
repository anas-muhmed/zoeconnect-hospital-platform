"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as Icons from "lucide-react";
import { products, otherModules, industries, deploymentModels } from "@/data/content";

const moduleNodes = [
  ...products.map((p) => ({ id: p.id, label: p.name.split(" & ")[0], icon: p.icon, live: true })),
  ...otherModules.map((m) => ({
    id: m.id,
    label: m.name.split(" & ")[0].split(" ").slice(0, 2).join(" "),
    icon: m.id === "loyalty" ? "Gift" : m.id === "incident" ? "ShieldAlert" : "ClipboardList",
    live: true,
  })),
];

const CENTER = 300;
const MODULE_RADIUS = 150;
const INDUSTRY_RADIUS = 250;

function pointOnCircle(index: number, count: number, radius: number, offsetDeg = -90) {
  const angle = ((offsetDeg + (360 / count) * index) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

/**
 * The signature "wow" scene: a single glowing platform core that modules
 * assemble around, that industries then plug into, and that finally
 * relabels itself across deployment models — the one visual that should
 * make "ZoeConnect is a platform, not an app" land in a single glance.
 */
export function PlatformCore() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const modulesGroupRef = useRef<SVGGElement>(null);
  const industriesGroupRef = useRef<HTMLDivElement>(null);
  const deployRef = useRef<HTMLDivElement>(null);
  const moduleLinesRef = useRef<SVGGElement>(null);
  const industryLinesRef = useRef<SVGGElement>(null);
  const stageLabelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      if (!sectionRef.current) return;

      const moduleLines = gsap.utils.toArray<SVGLineElement>(".module-line");
      const moduleDots = gsap.utils.toArray<SVGGElement>(".module-dot");
      const industryChips = gsap.utils.toArray<HTMLElement>(".industry-chip");
      const industryLines = gsap.utils.toArray<SVGLineElement>(".industry-line");
      const deployRows = gsap.utils.toArray<HTMLElement>(".deploy-row");
      const stageLabels = gsap.utils.toArray<HTMLElement>(".stage-label");

      gsap.set(moduleLines, { strokeDashoffset: 120, strokeDasharray: 120, opacity: 0 });
      gsap.set(moduleDots, { opacity: 0, scale: 0.4, transformOrigin: "center" });
      gsap.set(industryChips, { opacity: 0, scale: 0.6, transformOrigin: "center" });
      gsap.set(industryLines, { strokeDashoffset: 200, strokeDasharray: 200, opacity: 0 });
      gsap.set(deployRows, { opacity: 0, y: 12 });
      gsap.set(stageLabels, { opacity: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=280%",
          scrub: 1,
          pin: true,
        },
      });

      tl.to(stageLabels[0], { opacity: 1, duration: 0.5 })
        .to(stageLabels[0], { opacity: 0, duration: 0.5 }, "+=0.6")
        // Stage 1: modules assemble
        .to(moduleLines, { strokeDashoffset: 0, opacity: 1, duration: 1, stagger: 0.08 }, "<")
        .to(moduleDots, { opacity: 1, scale: 1, duration: 0.8, stagger: 0.08 }, "<0.1")
        .to(stageLabels[1], { opacity: 1, duration: 0.5 }, "<0.2")
        .to(stageLabels[1], { opacity: 0, duration: 0.5 }, "+=0.6")
        // Stage 2: industries plug in
        .to(industryLines, { strokeDashoffset: 0, opacity: 0.5, duration: 1, stagger: 0.05 }, "<")
        .to(industryChips, { opacity: 1, scale: 1, duration: 0.7, stagger: 0.05 }, "<0.1")
        .to(stageLabels[2], { opacity: 1, duration: 0.5 }, "<0.2")
        .to(stageLabels[2], { opacity: 0, duration: 0.5 }, "+=0.6")
        // Stage 3: deployment models cycle
        .to(deployRows[0], { opacity: 1, y: 0, duration: 0.4 }, "<")
        .to(deployRows[0], { opacity: 0, y: -12, duration: 0.4 }, "+=0.5")
        .to(deployRows[1], { opacity: 1, y: 0, duration: 0.4 }, "<")
        .to(deployRows[1], { opacity: 0, y: -12, duration: 0.4 }, "+=0.5")
        .to(deployRows[2], { opacity: 1, y: 0, duration: 0.4 }, "<")
        .to(deployRows[2], { opacity: 0, y: -12, duration: 0.4 }, "+=0.5")
        .to(deployRows[3], { opacity: 1, y: 0, duration: 0.4 }, "<")
        .to(stageLabels[3], { opacity: 1, duration: 0.5 }, "<");
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex h-screen items-center justify-center overflow-hidden bg-slate-900 text-white"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(216,154,58,0.16),transparent_60%)]" />

      {/* Stage captions */}
      <div className="pointer-events-none absolute top-16 left-1/2 w-full max-w-lg -translate-x-1/2 px-4 text-center sm:top-20">
        <div className="stage-label absolute inset-x-0 font-mono text-xs uppercase tracking-widest text-signal-300">
          One core. Everything else is configuration.
        </div>
        <div className="stage-label absolute inset-x-0 font-mono text-xs uppercase tracking-widest text-signal-300">
          The same modules, assembled around your operation.
        </div>
        <div className="stage-label absolute inset-x-0 font-mono text-xs uppercase tracking-widest text-signal-300">
          The same platform, plugged into nine industries.
        </div>
        <div ref={stageLabelRef} className="stage-label absolute inset-x-0 font-mono text-xs uppercase tracking-widest text-signal-300">
          Deployed however your organization runs.
        </div>
      </div>

      <div className="relative mx-auto flex h-[600px] w-[600px] max-w-[90vw] items-center justify-center">
        <svg viewBox="0 0 600 600" className="absolute inset-0 h-full w-full">
          <g ref={moduleLinesRef}>
            {moduleNodes.map((m, i) => {
              const p = pointOnCircle(i, moduleNodes.length, MODULE_RADIUS);
              return (
                <line
                  key={m.id}
                  className="module-line"
                  x1={CENTER}
                  y1={CENTER}
                  x2={p.x}
                  y2={p.y}
                  stroke="#e6b45c"
                  strokeWidth={1}
                />
              );
            })}
          </g>
          <g ref={industryLinesRef}>
            {industries.map((ind, i) => {
              const p = pointOnCircle(i, industries.length, INDUSTRY_RADIUS, -90 + 8);
              const m = pointOnCircle(i % moduleNodes.length, moduleNodes.length, MODULE_RADIUS);
              return (
                <line
                  key={ind.id}
                  className="industry-line"
                  x1={m.x}
                  y1={m.y}
                  x2={p.x}
                  y2={p.y}
                  stroke="#f2c98a"
                  strokeWidth={0.75}
                />
              );
            })}
          </g>
          <g ref={modulesGroupRef}>
            {moduleNodes.map((m, i) => {
              const p = pointOnCircle(i, moduleNodes.length, MODULE_RADIUS);
              const Icon = (Icons as any)[m.icon] ?? Icons.Sparkles;
              return (
                <g key={m.id} className="module-dot" transform={`translate(${p.x}, ${p.y})`}>
                  <circle
                    r={30}
                    fill={m.live ? "#12151a" : "#1c2128"}
                    stroke={m.live ? "#e6b45c" : "#3a3f47"}
                    strokeWidth={1.5}
                  />
                  <foreignObject x={-14} y={-14} width={28} height={28}>
                    <Icon className="h-full w-full" color={m.live ? "#e6b45c" : "#9aa0aa"} strokeWidth={1.4} />
                  </foreignObject>
                  <text
                    y={48}
                    textAnchor="middle"
                    fontSize={11}
                    fill={m.live ? "#f5efe6" : "#9aa0aa"}
                    fontFamily="var(--font-mono)"
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Core */}
        <div className="relative z-10 flex h-28 w-28 flex-col items-center justify-center rounded-full border border-signal-400/50 bg-slate-900 shadow-[0_0_60px_rgba(230,180,92,0.25)]">
          <span className="animate-signal-pulse absolute h-28 w-28 rounded-full border border-signal-400/30" />
          <span className="font-display text-lg font-semibold tracking-tight">Zoe</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-signal-300">Core</span>
        </div>

        {/* Industry chips */}
        <div ref={industriesGroupRef} className="absolute inset-0">
          {industries.map((ind, i) => {
            const p = pointOnCircle(i, industries.length, INDUSTRY_RADIUS, -90 + 8);
            return (
              <div
                key={ind.id}
                className="industry-chip absolute rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-white/70 backdrop-blur-sm"
                style={{
                  left: p.x,
                  top: p.y,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {ind.name}
              </div>
            );
          })}
        </div>
      </div>

      {/* Deployment cycling label */}
      <div className="pointer-events-none absolute bottom-16 left-1/2 w-full max-w-md -translate-x-1/2 px-4 text-center sm:bottom-20">
        {deploymentModels.map((d) => (
          <div key={d.name} className="deploy-row absolute inset-x-0">
            <p className="font-display text-xl font-semibold text-white sm:text-2xl">{d.name}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-white/50 sm:text-sm">{d.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

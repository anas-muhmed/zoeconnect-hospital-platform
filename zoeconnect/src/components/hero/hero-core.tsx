"use client";

/**
 * Wraps the WebGL Intelligence Core scene with everything that shouldn't
 * live inside the Canvas: lazy loading (so the 3D bundle never blocks first
 * paint), a lightweight CSS fallback for the loading/no-motion/no-WebGL
 * cases, and an outer perspective tilt that responds to the cursor — a
 * second, slower layer of parallax on top of the object's own internal
 * tilt, which is what makes the hover feel physical rather than flat.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "framer-motion";

const IntelligenceCore = dynamic(() => import("@/components/three/intelligence-core"), {
  ssr: false,
  loading: () => <CoreFallback />,
});

function CoreFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <div className="h-40 w-40 animate-pulse rounded-full bg-accent/20 blur-2xl sm:h-56 sm:w-56" />
      <div className="absolute h-24 w-24 rounded-full border border-accent/30 sm:h-32 sm:w-32" />
    </div>
  );
}

export function HeroCore() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [mounted, setMounted] = useState(false);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 80, damping: 18, mass: 0.6 });
  const springY = useSpring(rotateY, { stiffness: 80, damping: 18, mass: 0.6 });
  const shineX = useTransform(springY, [-6, 6], [0, 100]);
  const shineY = useTransform(springX, [-6, 6], [100, 0]);
  const shineBackground = useMotionTemplate`radial-gradient(320px circle at ${shineX}% ${shineY}%, hsl(var(--accent) / 0.16), transparent 60%)`;

  useEffect(() => {
    setMounted(true);
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(reducedQuery.matches);
    update();
    reducedQuery.addEventListener("change", update);

    const sizeQuery = window.matchMedia("(max-width: 767px)");
    const updateSize = () => setQuality(sizeQuery.matches ? "low" : "high");
    updateSize();
    sizeQuery.addEventListener("change", updateSize);

    return () => {
      reducedQuery.removeEventListener("change", update);
      sizeQuery.removeEventListener("change", updateSize);
    };
  }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reducedMotion) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 12);
    rotateX.set(-py * 12);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div
      className="relative flex h-[480px] w-full items-center justify-center [perspective:1400px] sm:h-[600px] lg:h-[660px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* engine glow the object sits inside, supporting rather than competing */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 aspect-square h-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.12] blur-[110px]" />
        <div className="absolute left-1/2 top-1/2 aspect-square h-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal-500/10 blur-[70px]" />
      </div>

      {/*
        The reveal here is a plain CSS animation (animate-fade-in), not a
        framer-motion initial/animate pair. This exact div also holds the
        rotateX/rotateY spring below, which is framer-motion and does need
        JS — but that's fine because its resting value (0deg) is already
        the normal, visible orientation, so slow hydration just means the
        tilt-on-hover effect arrives a beat late, not that the whole object
        stays invisible. Opacity 0 as a JS-only starting state doesn't have
        that safety net: if hydration lags (slow network, a cold Next.js
        dev compile, a heavy chunk like this Three.js one still loading),
        the object — and its own loading fallback, since both are inside
        this wrapper — sits invisible until something re-triggers a
        render. A CSS animation is scheduled by the browser at first paint
        regardless of hydration timing, so it can't get stuck that way.
      */}
      <motion.div
        ref={containerRef}
        style={{
          rotateX: springX,
          rotateY: springY,
          transformStyle: "preserve-3d",
          animationDelay: "0.15s",
        }}
        className="relative h-full w-full animate-fade-in"
      >
        {mounted && (
          <IntelligenceCore quality={quality} reducedMotion={reducedMotion} />
        )}
        {!mounted && <CoreFallback />}

        {/* subtle specular sheen that tracks tilt, reinforcing the physical feel.
            No border-radius here: rounding a non-square inset-0 box resolves to
            a stadium shape, not a circle, and its flat edge was showing up as a
            hard seam across the sphere. The radial-gradient itself already
            supplies the circular falloff, so the box can stay a plain rect. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{ background: shineBackground }}
        />
      </motion.div>
    </div>
  );
}

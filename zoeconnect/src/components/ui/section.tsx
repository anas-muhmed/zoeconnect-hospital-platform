"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Section({
  id,
  className,
  children,
  eyebrow,
  title,
  description,
}: {
  id?: string;
  className?: string;
  children?: React.ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <section id={id} className={cn("relative py-24 sm:py-32", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {(eyebrow || title || description) && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mb-16 max-w-2xl text-center"
          >
            {eyebrow && (
              <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
                {eyebrow}
              </span>
            )}
            {title && (
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-4 text-balance text-base text-foreground/60 sm:text-lg">
                {description}
              </p>
            )}
          </motion.div>
        )}
        {children}
      </div>
    </section>
  );
}

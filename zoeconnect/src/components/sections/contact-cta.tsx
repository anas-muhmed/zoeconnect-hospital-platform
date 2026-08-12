"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { easeSmooth } from "@/lib/utils";

export function ContactCta() {
  return (
    <section id="contact" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: easeSmooth }}
          className="relative overflow-hidden rounded-[2.5rem] border border-border/60 bg-gradient-to-br from-signal-500/12 via-surface to-signal-300/8 px-8 py-16 text-center sm:px-16"
        >
          <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-signal-500/20 blur-[100px]" />
          <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-signal-300/20 blur-[100px]" />
          <div className="relative">
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Ready to run your enterprise on ZoeConnect?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-balance text-foreground/60 sm:text-lg">
              Book a personalized walkthrough with our solutions team and see the
              platform mapped to your workflows.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/company/contact"
                className="group flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-transform hover:scale-105"
              >
                Request a Demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/resources/documentation"
                className="rounded-full border border-border/60 bg-surface/50 px-6 py-3.5 text-sm font-semibold backdrop-blur-xl transition-colors hover:border-accent/60 hover:text-accent"
              >
                View Documentation
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

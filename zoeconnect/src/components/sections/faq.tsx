"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { faqs } from "@/data/content";
import { Section } from "@/components/ui/section";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section eyebrow="FAQ" title="Questions, answered">
      <div className="mx-auto max-w-3xl divide-y divide-border/60 rounded-3xl border border-border/60 bg-surface/50 backdrop-blur-xl">
        {faqs.map((item, i) => (
          <div key={item.q} className="px-6 sm:px-8">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between gap-4 py-6 text-left"
              aria-expanded={open === i}
            >
              <span className="font-medium">{item.q}</span>
              <Plus
                className={`h-5 w-5 flex-shrink-0 text-accent transition-transform duration-300 ${open === i ? "rotate-45" : ""}`}
              />
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <p className="pb-6 text-sm text-foreground/60">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Section>
  );
}

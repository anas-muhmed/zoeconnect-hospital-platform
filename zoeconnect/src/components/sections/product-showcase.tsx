"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { products } from "@/data/content";
import { QueueVisual } from "@/components/product-visuals/queue-visual";
import { SignageVisual } from "@/components/product-visuals/signage-visual";
import { FeedbackVisual } from "@/components/product-visuals/feedback-visual";

const easeOut = [0.16, 1, 0.3, 1] as const;

const visuals: Record<string, React.ComponentType> = {
  queue: QueueVisual,
  signage: SignageVisual,
  feedback: FeedbackVisual,
};

export function ProductShowcase() {
  return (
    <section id="products" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-20 max-w-xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-accent">
            Three of Six Modules
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            One connected service journey
          </h2>
        </div>

        <div className="flex flex-col gap-24 sm:gap-32">
          {products.map((product, i) => {
            const Visual = visuals[product.id];
            const reversed = i % 2 === 1;
            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: easeOut }}
                className={`grid grid-cols-1 items-center gap-12 lg:grid-cols-2 ${
                  reversed ? "lg:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div>
                  <span className="font-mono text-xs text-foreground/35">
                    0{i + 1} / {String(products.length).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">
                    {product.name}
                  </h3>
                  <p className="mt-2 text-accent">{product.tagline}</p>
                  <p className="mt-4 max-w-md text-foreground/60">{product.description}</p>
                  <Link
                    href={product.href}
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/80 transition-colors hover:text-accent"
                  >
                    Explore this module <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="flex justify-center">{Visual && <Visual />}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

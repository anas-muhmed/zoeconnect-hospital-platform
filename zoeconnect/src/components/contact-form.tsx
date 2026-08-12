"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setTimeout(() => setStatus("sent"), 1000);
  }

  if (status === "sent") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex h-full flex-col items-center justify-center rounded-3xl border border-border/60 bg-surface/50 p-12 text-center backdrop-blur-xl"
      >
        <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-400" />
        <h3 className="font-display text-xl font-semibold">Thanks — we'll be in touch</h3>
        <p className="mt-2 text-sm text-foreground/60">
          A ZoeConnect specialist will reach out within one business day.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-border/60 bg-surface/50 p-8 backdrop-blur-xl">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="mb-2 block text-sm font-medium">First name</label>
          <input id="firstName" required className="w-full rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm outline-none ring-accent/50 focus:ring-2" />
        </div>
        <div>
          <label htmlFor="lastName" className="mb-2 block text-sm font-medium">Last name</label>
          <input id="lastName" required className="w-full rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm outline-none ring-accent/50 focus:ring-2" />
        </div>
      </div>
      <div>
        <label htmlFor="workEmail" className="mb-2 block text-sm font-medium">Work email</label>
        <input id="workEmail" type="email" required className="w-full rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm outline-none ring-accent/50 focus:ring-2" />
      </div>
      <div>
        <label htmlFor="company" className="mb-2 block text-sm font-medium">Company</label>
        <input id="company" required className="w-full rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm outline-none ring-accent/50 focus:ring-2" />
      </div>
      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-medium">How can we help?</label>
        <textarea id="message" rows={4} className="w-full rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm outline-none ring-accent/50 focus:ring-2" />
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-sm font-semibold text-background transition-transform hover:scale-[1.01] disabled:opacity-70"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending...
          </>
        ) : (
          "Request a Demo"
        )}
      </button>
    </form>
  );
}

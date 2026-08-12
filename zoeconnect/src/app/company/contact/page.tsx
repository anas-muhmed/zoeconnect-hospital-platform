import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { Mail, MapPin, Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description: "Request a demo or get in touch with the ZoeConnect team.",
};

export default function ContactPage() {
  return (
    <section className="relative overflow-hidden pt-40 pb-24">
      <div className="grid-fade absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            Contact
          </span>
          <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Let's talk about your enterprise
          </h1>
          <p className="mt-4 text-balance text-lg text-foreground/60">
            Tell us about your organization and we'll route you to the right
            specialist within one business day.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ContactForm />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-border/60 bg-surface/50 p-6 backdrop-blur-xl">
              <Mail className="h-5 w-5 text-accent" />
              <p className="mt-3 font-semibold">Email us</p>
              <p className="text-sm text-foreground/60">info@camerinfolks.com</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-surface/50 p-6 backdrop-blur-xl">
              <Phone className="h-5 w-5 text-accent" />
              <p className="mt-3 font-semibold">Call us</p>
              <p className="text-sm text-foreground/60">+91 484-4063599</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-surface/50 p-6 backdrop-blur-xl">
              <MapPin className="h-5 w-5 text-accent" />
              <p className="mt-3 font-semibold">Headquarters</p>
              <p className="text-sm text-foreground/60">Camerin Innovate Pvt Ltd, Carnival Infopark Phase 1, Kakkanad, Kochi, Kerala, 682030</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

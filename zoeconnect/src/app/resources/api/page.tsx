import type { Metadata } from "next";
import { Section } from "@/components/ui/section";

export const metadata: Metadata = { title: "API Reference", description: "REST API reference for the ZoeConnect platform." };

// Real controller route prefixes from the ZoeConnect backend (NestJS), grouped
// by module — illustrative subset, not an exhaustive list.
const endpoints = [
  { method: "GET/POST", path: "/token/queue", desc: "Live token queue operations — call, recall, skip, transfer." },
  { method: "GET/POST", path: "/token/registration", desc: "Visitor or customer registration feeding directly into the queue engine." },
  { method: "GET", path: "/token/analytics", desc: "Queue and waiting-time analytics by department and counter." },
  { method: "GET/POST", path: "/cms/playlists", desc: "Build and manage digital signage playlists." },
  { method: "POST", path: "/cms/emergency", desc: "Push an emergency override to every connected display." },
  { method: "GET/POST", path: "/feedback/forms", desc: "Build and publish customer or visitor feedback forms." },
  { method: "GET", path: "/feedback/analytics", desc: "Department, staff, and branch-level satisfaction analytics." },
  { method: "POST", path: "/feedback/public", desc: "Public, QR-linked feedback submission endpoint." },
];

export default function ApiPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-40 pb-16">
        <div className="grid-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
            Resources
          </span>
          <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">Developer API Reference</h1>
          <p className="mx-auto mt-4 max-w-xl text-foreground/60">
            A representative sample of ZoeConnect's REST API surface, organized by module.
          </p>
        </div>
      </section>
      <Section className="!pt-8">
        <div className="mx-auto max-w-3xl divide-y divide-border/60 rounded-3xl border border-border/60 bg-surface/50 backdrop-blur-xl">
          {endpoints.map((e) => (
            <div key={e.path} className="flex flex-col gap-2 p-6 sm:flex-row sm:items-center sm:gap-6">
              <span className="w-fit rounded-md bg-accent/10 px-2.5 py-1 font-mono text-xs font-semibold text-accent">{e.method}</span>
              <code className="font-mono text-sm">{e.path}</code>
              <span className="text-sm text-foreground/60 sm:ml-auto">{e.desc}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function LegalPage() {
  return (
    <section className="relative pt-40 pb-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-4 text-sm text-foreground/50">Last updated July 2026</p>
        <div className="prose prose-invert mt-10 max-w-none text-foreground/70">
          <p>
            This is placeholder content for ZoeConnect's Privacy Policy. Replace this
            section with your organization's reviewed legal copy before
            production launch.
          </p>
          <p>
            ZoeConnect, Inc. is committed to protecting the privacy, security,
            and rights of every organization and individual using the
            platform. For questions, contact legal@zoeconnect.ai.
          </p>
        </div>
      </div>
    </section>
  );
}

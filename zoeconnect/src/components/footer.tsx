import Link from "next/link";
import { navMenu } from "@/data/nav";
import { Github, Linkedin, Twitter } from "lucide-react";
import Image from "next/image";
import { Logo } from "@/components/brand/logo";

export function Footer() {
  return (
    <footer className="relative border-t border-border/60 bg-surface/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          <div className="col-span-2">
            <Link href="/" className="flex items-center">
              <Logo variant="icon-text" iconSize={30} />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-foreground/60">
              The digital service platform unifying queue management, digital signage, and feedback management into one configurable fabric — across healthcare, enterprise, government, and more.
            </p>
            <div className="mt-6 flex gap-3">
              {[Twitter, Linkedin, Github].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="Social link"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-foreground/60 transition-colors hover:border-accent/60 hover:text-accent"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
          {Object.entries(navMenu).map(([key, cols]) => (
            <div key={key}>
              <p className="mb-3 text-sm font-semibold">{key}</p>
              <ul className="space-y-2">
                {cols.flatMap((c) => c.links).slice(0, 6).map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-foreground/60 transition-colors hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-8 text-xs text-foreground/50 sm:flex-row">
          <p>© {new Date().getFullYear()} ZoeConnect, a Camerin Innovate product. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/legal/privacy" className="hover:text-accent">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-accent">Terms</Link>
            <Link href="/legal/security" className="hover:text-accent">Security</Link>
            <span className="flex items-center gap-2 border-l border-border/60 pl-6">
              Powered by
              <Image
                src="/brand/camerin-logo-icon.png"
                alt="Camerin Innovate"
                width={28}
                height={28}
                className="h-5 w-5 opacity-80"
              />
              Camerin Innovate
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

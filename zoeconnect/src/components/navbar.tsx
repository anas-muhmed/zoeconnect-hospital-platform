"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navMenu, flatNav } from "@/data/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/logo";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Close any open menu/drawer on route change, on a separate render pass from
  // the click that triggered navigation — closing them synchronously inside a
  // Link's onClick races Framer Motion's exit animation against Next.js
  // unmounting the same subtree, which throws a DOM "removeChild" error.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "py-2" : "py-4"
      )}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "flex items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-500",
            scrolled ? "glass-strong shadow-lg shadow-black/5" : "bg-transparent"
          )}
        >
          <Link href="/" className="flex items-center">
            <Logo variant="icon-text" iconSize={30} />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {flatNav.map((item) => (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => item.key && setOpenMenu(item.key)}
              >
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface hover:text-foreground"
                    aria-expanded={openMenu === item.key}
                  >
                    {item.label}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              aria-label="Search"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-surface/60 text-foreground/80 transition-colors hover:border-accent/60 hover:text-accent"
            >
              <Search className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:border-accent/60 hover:text-accent"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-transform hover:scale-105"
            >
              Sign Up
            </Link>
          </div>

          <button
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 lg:hidden"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {openMenu && navMenu[openMenu] && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="glass-strong mt-2 hidden rounded-2xl p-6 shadow-xl lg:grid lg:grid-cols-2 lg:gap-8"
            >
              {navMenu[openMenu].map((col) => (
                <div key={col.heading}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/50">
                    {col.heading}
                  </p>
                  <ul className="space-y-1">
                    {col.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="block rounded-lg px-3 py-2 transition-colors hover:bg-surface"
                        >
                          <span className="block text-sm font-medium">{link.label}</span>
                          {link.description && (
                            <span className="block text-xs text-foreground/50">{link.description}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mt-2 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-2xl lg:hidden"
          >
            <div className="glass-strong space-y-4 p-6">
              {Object.entries(navMenu).map(([key, cols]) => (
                <div key={key}>
                  <p className="mb-2 text-sm font-semibold">{key}</p>
                  <ul className="space-y-1 pl-2">
                    {cols.flatMap((c) => c.links).map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="block rounded-lg px-2 py-1.5 text-sm text-foreground/70 hover:bg-surface hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                <ThemeToggle />
                <div className="flex items-center gap-2">
                  <Link
                    href="/sign-in"
                    className="rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground/80"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/sign-up"
                    className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
                  >
                    Sign Up
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

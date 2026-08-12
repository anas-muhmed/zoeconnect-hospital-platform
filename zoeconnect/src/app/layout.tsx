import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SmoothScroll } from "@/components/smooth-scroll";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ChapterRail } from "@/components/chapter-rail";
import { AmbientGlow } from "@/components/ambient-glow";

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zoeconnect.ai"),
  title: {
    default: "ZoeConnect — Digital Service Platform",
    template: "%s | ZoeConnect",
  },
  description:
    "ZoeConnect unifies configurable queue management, digital signage, and feedback modules into one modular digital service platform — deployed alongside whatever system of record your organization already runs, across healthcare, enterprise, government, education, and more.",
  keywords: [
    "digital service platform",
    "queue management",
    "digital signage",
    "feedback management",
    "system integration",
    "ZoeConnect",
  ],
  openGraph: {
    title: "ZoeConnect — Digital Service Platform",
    description:
      "Configurable queue management, digital signage, and feedback modules — one modular platform, deployed across any industry's system of record.",
    url: "https://www.zoeconnect.ai",
    siteName: "ZoeConnect",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZoeConnect — Digital Service Platform",
    description:
      "Configurable queue management, digital signage, and feedback modules — one modular platform, deployed across any industry's system of record.",
  },
  icons: { icon: "/brand/logo-icon.png", apple: "/brand/logo-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${body.variable} ${display.variable} ${mono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <SmoothScroll>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground"
            >
              Skip to content
            </a>
            <div className="noise-overlay" aria-hidden="true" />
            <AmbientGlow />
            <ChapterRail />
            <Navbar />
            <main id="main-content">{children}</main>
            <Footer />
          </SmoothScroll>
        </ThemeProvider>
      </body>
    </html>
  );
}

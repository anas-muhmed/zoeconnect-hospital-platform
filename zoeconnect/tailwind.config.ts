import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        border: "hsl(var(--border))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        // ZoeConnect brand: warm brass/signal gold as the single accent,
        // deep slate as the structural secondary. Deliberately not the
        // violet/cyan pairing common to generated SaaS templates.
        signal: {
          300: "#f2c98a",
          400: "#e6b45c",
          500: "#d89a3a",
          600: "#b87b26",
        },
        slate: {
          800: "#1c2128",
          900: "#12151a",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
      animation: {
        "spin-slow": "spin 16s linear infinite",
        float: "float 7s ease-in-out infinite",
        "float-delay": "float 9s ease-in-out infinite 2s",
        shimmer: "shimmer 3s linear infinite",
        marquee: "marquee 44s linear infinite",
        "marquee-reverse": "marquee-reverse 38s linear infinite",
        "signal-pulse": "signal-pulse 3s ease-in-out infinite",
        rise: "rise 1s cubic-bezier(0.16, 1, 0.3, 1) both",
        "grid-drift": "grid-drift 14s linear infinite",
        "word-rise": "word-rise 0.85s cubic-bezier(0.16, 1, 0.3, 1) both",
        "draw-underline": "draw-underline 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 1s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(-16px) rotate(1.5deg)" },
        },
        "grid-drift": {
          "0%": { backgroundPosition: "0px 0px" },
          "100%": { backgroundPosition: "56px 56px" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        "signal-pulse": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(28px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "word-rise": {
          "0%": { transform: "translateY(115%)" },
          "100%": { transform: "translateY(0%)" },
        },
        "draw-underline": {
          "0%": { width: "0" },
          "100%": { width: "4.5rem" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;

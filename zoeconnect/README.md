# ZoeConnect — Enterprise AI Platform Website

A cinematic, animation-driven marketing site for ZoeConnect, an AI-powered enterprise platform. Built with Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion, GSAP + ScrollTrigger, Lenis smooth scroll, and React Three Fiber.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The landing page is the default route (`/`). The Sign In button in the navbar links to `/sign-in`, a dedicated enterprise login experience (org selector → credentials → MFA step, plus a forgot-password flow).

## What's included

- **Landing page** (`/`): cinematic hero with a React Three Fiber 3D scene, GSAP-pinned horizontal scroll storytelling, animated stats, product showcase, AI assistants, architecture diagram, industries, integrations, security, testimonials carousel, pricing, FAQ, and a contact CTA.
- **Sign-in** (`/sign-in`, `/sign-in/forgot-password`): animated aurora background, organization selector, SSO buttons (Google Workspace, Microsoft Entra ID, Okta), credentials step, MFA code entry, forgot-password flow.
- **Product pages** (`/products/*`): platform overview, AI suite, workflow automation, analytics, identity & access, forms engine, integrations, developer APIs — all data-driven from `src/data/product-pages.ts`.
- **Solution pages** (`/solutions/*`): healthcare, enterprise, government, education, hospitality, manufacturing — data-driven from `src/data/solution-pages.ts`.
- **Company** (`/company/about`, `/careers`, `/blog`, `/contact`) and **Resources** (`/resources/documentation`, `/api`, `/downloads`, `/help-center`) sections.
- Dark/light theme via `next-themes`, mega-menu navigation, mobile nav, SEO metadata + `sitemap.ts` / `robots.ts`, reduced-motion support, and glassmorphism/gradient design system in `globals.css` + `tailwind.config.ts`.

## Notes

- All content is mock/placeholder data (see `src/data/`) — swap in real API calls when ready to connect a backend.
- `next/font` (Inter, Sora) fetches from Google Fonts at build time, so the build requires network access.
- 3D hero scene is client-only and dynamically imported (`ssr: false`) to keep initial HTML light.
- Legal pages (`/legal/*`) contain placeholder copy — replace with reviewed legal text before launch.

## Tech stack

Next.js 15 · React 18 · TypeScript · Tailwind CSS · Framer Motion · GSAP + ScrollTrigger · Lenis · React Three Fiber + drei · next-themes · lucide-react

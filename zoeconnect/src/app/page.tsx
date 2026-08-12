import { Hero } from "@/components/sections/hero";
import { LogoMarquee } from "@/components/sections/logo-marquee";
import { Stats } from "@/components/sections/stats";
import { WhyItExists } from "@/components/sections/why-it-exists";
import { ScrollStory } from "@/components/sections/scroll-story";
import { PlatformCore } from "@/components/sections/platform-core";
import { Architecture } from "@/components/sections/architecture";
import { ProductShowcase } from "@/components/sections/product-showcase";
import { EngineeringModules } from "@/components/sections/engineering-modules";
import { Industries } from "@/components/sections/industries";
import { PlatformInAction } from "@/components/sections/platform-in-action";
import { Integrations } from "@/components/sections/integrations";
import { Security } from "@/components/sections/security";
import { Testimonials } from "@/components/sections/testimonials";
import { Clients } from "@/components/sections/clients";
import { Pricing } from "@/components/sections/pricing";
import { Faq } from "@/components/sections/faq";
import { ContactCta } from "@/components/sections/contact-cta";

export default function Home() {
  return (
    <>
      {/*
        The page is structured as seven narrative acts (see chapter-rail.tsx),
        each answering one question in order: what ZoeConnect is, why it
        exists, how it works, what it can build, how it deploys, why to trust
        it, and how to get started. data-act on each wrapper drives the fixed
        chapter indicator and keeps the whole scroll reading as one continuous
        product story instead of a stack of independent sections.
      */}
      <div data-act="what">
        <Hero />
        <LogoMarquee />
        <Stats />
      </div>

      <WhyItExists />

      <div data-act="how">
        <PlatformCore />
        <ScrollStory />
        <Architecture />
        <ProductShowcase />
      </div>

      <div data-act="build">
        <PlatformInAction />
        <EngineeringModules />
        <Industries />
      </div>

      <div data-act="deploy">
        <Integrations />
      </div>

      <div data-act="trust">
        <Clients />
        <Security />
        <Testimonials />
      </div>

      <div data-act="start">
        <Pricing />
        <Faq />
        <ContactCta />
      </div>
    </>
  );
}

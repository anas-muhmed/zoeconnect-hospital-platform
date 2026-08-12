export type NavLink = { label: string; href: string; description?: string };
export type NavColumn = { heading: string; links: NavLink[] };

export const navMenu: Record<string, NavColumn[]> = {
  Products: [
    {
      heading: "The Six Modules",
      links: [
        { label: "Platform Overview", href: "/products/platform", description: "The ZoeConnect Integration & Security Layer" },
        { label: "Smart Queue & Service Management", href: "/products/queue", description: "Live · Configurable service queuing" },
        { label: "Content & Digital Signage Management", href: "/products/signage", description: "Live · Facility-wide digital signage" },
        { label: "Experience Feedback Management", href: "/products/feedback", description: "Live · QR feedback & reputation" },
        { label: "Loyalty & Rewards Engine", href: "/products/loyalty", description: "Live · Points, cards, campaigns" },
        { label: "Incident & Risk Management", href: "/products/incident", description: "Live · Logging, CAPA, risk matrix" },
        { label: "Program Enrollment & Case Management", href: "/products/enrollment", description: "Live · Intake through case closure" },
      ],
    },
    {
      heading: "Platform Foundation",
      links: [
        { label: "Document & Forms Engine", href: "/products/document-studio", description: "Underlying engine, not a customer module" },
        { label: "System Integration & Connector", href: "/products/integration", description: "The core-system bridge architecture" },
        { label: "Developer & Integration APIs", href: "/products/developer-apis", description: "REST APIs for any system of record" },
      ],
    },
  ],
  Solutions: [
    {
      heading: "Industries",
      links: [
        { label: "Healthcare", href: "/solutions/healthcare" },
        { label: "Enterprise", href: "/solutions/enterprise" },
        { label: "Government", href: "/solutions/government" },
        { label: "Education", href: "/solutions/education" },
        { label: "Manufacturing", href: "/solutions/manufacturing" },
        { label: "Hospitality", href: "/solutions/hospitality" },
        { label: "Retail", href: "/solutions/retail" },
        { label: "Finance", href: "/solutions/finance" },
        { label: "Logistics", href: "/solutions/logistics" },
      ],
    },
  ],
  Company: [
    {
      heading: "Company",
      links: [
        { label: "About", href: "/company/about" },
        { label: "Careers", href: "/company/careers" },
        { label: "Blog", href: "/company/blog" },
        { label: "Contact", href: "/company/contact" },
      ],
    },
  ],
  Resources: [
    {
      heading: "Resources",
      links: [
        { label: "Documentation", href: "/resources/documentation" },
        { label: "API Reference", href: "/resources/api" },
        { label: "Downloads", href: "/resources/downloads" },
        { label: "Help Center", href: "/resources/help-center" },
      ],
    },
  ],
};

export const flatNav = [
  { label: "Products", key: "Products" },
  { label: "Solutions", key: "Solutions" },
  { label: "Company", key: "Company" },
  { label: "Resources", key: "Resources" },
  { label: "Pricing", href: "/#pricing" },
];

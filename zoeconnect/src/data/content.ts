// Content here is grounded in the real ZoeConnect/HDSP codebase and its sales
// materials, generalized to how ZoeConnect actually positions itself today: an
// extensible, configurable Digital Service Platform — not a healthcare-only
// product. Healthcare is the vertical it was proven in first; the same module
// architecture (queuing, digital signage, feedback, and the platform layer
// beneath them) is industry-agnostic by design.
//
// Six modules are live today: Queue, Content & Signage, Feedback, Loyalty,
// Incident, and Program Enrollment. Platform Infrastructure is real
// engineering underneath those modules, not sold as a module itself.
// Roadmap = named as a future capability, not yet built.

export const platformStats = [
  { value: 6, suffix: "", label: "Modules across the platform" },
  { value: 9, suffix: "", label: "Industries the same modules configure for" },
  { value: 4, suffix: "", label: "Deployment models: on-prem, private cloud, hybrid, multi-tenant" },
  { value: 24, suffix: "x7", label: "Live monitoring across every deployment" },
];

export const products = [
  {
    id: "queue",
    name: "Smart Queue & Service Management",
    tagline: "Configurable service-counter queuing for any front-line operation",
    description:
      "A department-wise and counter-wise queuing engine — proven first in hospital OPD counters — that configures just as cleanly for a bank branch, a government service window, or a retail help desk: registration through live queue, counter call, and service analytics.",
    href: "/products/queue",
    icon: "Ticket",
    status: "live" as const,
  },
  {
    id: "signage",
    name: "Content & Digital Signage Management",
    tagline: "One content hub, every screen in the building, in sync",
    description:
      "A centralized content management engine for every screen in a facility — drag-and-drop playlists, offline caching, and instant emergency override — built for hospital waiting areas, equally suited to retail floors, branch lobbies, or corporate campuses.",
    href: "/products/signage",
    icon: "MonitorPlay",
    status: "live" as const,
  },
  {
    id: "feedback",
    name: "Experience Feedback Management",
    tagline: "Capture, analyze, and act on the voice of the people you serve",
    description:
      "A QR-driven feedback journey from a drag-and-drop form builder to public review redirection for happy responses and an internal resolution workflow for the rest — configurable for patients, citizens, guests, or customers alike.",
    href: "/products/feedback",
    icon: "MessageSquareHeart",
    status: "live" as const,
  },
];

// The other three of ZoeConnect's six current modules — configured the same
// way as Queue, Content & Signage, and Feedback: independently deployable,
// sharing the same Integration & Security Layer.
export const otherModules = [
  {
    id: "loyalty",
    name: "Loyalty & Rewards Engine",
    detail:
      "A full points/cards/campaigns/redemption engine, bridged to core-system billing and deposit data — configurable as patient loyalty, guest loyalty, or customer rewards.",
  },
  {
    id: "incident",
    name: "Incident & Risk Management",
    detail:
      "Incident logging, severity/priority/risk-matrix configuration, and CAPA (corrective and preventive action) workflows — a generic safety/quality engine, not a hospital-only one.",
  },
  {
    id: "enrollment",
    name: "Program Enrollment & Case Management",
    detail:
      "A structured case lifecycle: multi-discipline intake and assessment, per-session progress logging against tracked goals, periodic multi-party review with supervisor sign-off, and a closure/discharge summary — built first for a multi-disciplinary therapy program, generalizable to any structured enrollment or case-management workflow.",
  },
];

// Real platform-level engineering that exists in the ZoeConnect codebase
// today but isn't counted among the six customer-facing modules above — the
// foundation the modules are built on, not a module in its own right.
export const platformInfrastructure = [
  {
    id: "document-studio",
    name: "Document & Forms Engine",
    detail:
      "A document engine, workflow engine, compliance engine, and asset library on a purpose-built canvas engine — the underlying engine Program Enrollment & Case Management and other modules are built on.",
  },
  {
    id: "attendance",
    name: "Workforce Attendance Engine",
    detail:
      "A real-time, dependency-aware staff attendance engine, usable across any multi-shift, multi-location workforce.",
  },
  {
    id: "backup",
    name: "Backup & Disaster Recovery",
    detail:
      "Scheduled and on-demand backup/restore jobs across multiple storage destinations, with its own job queue and audit trail.",
  },
];

export const roadmapModules = [
  "Role-Specific Dashboards",
  "Resource & Facility Scheduling",
  "Emergency Management",
  "Appointment Management",
  "Customer Mobile App",
  "Visitor Management",
  "AI Analytics",
  "Employee Self Service",
];

// The industries ZoeConnect's configurable modules serve today or are
// designed to extend into — healthcare is one of nine, not the platform's
// identity.
export const industries = [
  {
    id: "healthcare",
    name: "Healthcare",
    blurb: "Where ZoeConnect's modules were first proven — OPD queuing, patient displays, and feedback across single and multi-branch hospitals.",
    href: "/solutions/healthcare",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    blurb: "Front-desk and service-counter operations, internal signage, and employee/customer feedback across a large organization.",
    href: "/solutions/enterprise",
  },
  {
    id: "government",
    name: "Government",
    blurb: "Citizen service-counter queuing, public information displays, and constituent feedback at scale.",
    href: "/solutions/government",
  },
  {
    id: "education",
    name: "Education",
    blurb: "Campus service-counter queuing, digital signage across buildings, and student/parent feedback.",
    href: "/solutions/education",
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    blurb: "Plant-floor service counters, safety signage, and incident/risk workflows across facilities.",
    href: "/solutions/manufacturing",
  },
  {
    id: "hospitality",
    name: "Hospitality",
    blurb: "Guest-facing queuing, branded property signage, and guest feedback across single or multi-property portfolios.",
    href: "/solutions/hospitality",
  },
  {
    id: "retail",
    name: "Retail",
    blurb: "Store service-desk queuing, in-store digital signage, and customer feedback across a retail footprint.",
    href: "/solutions/retail",
  },
  {
    id: "finance",
    name: "Finance",
    blurb: "Branch queuing, lobby signage, and customer feedback for banks, credit unions, and insurers.",
    href: "/solutions/finance",
  },
  {
    id: "logistics",
    name: "Logistics",
    blurb: "Depot/counter queuing, facility signage, and customer or driver feedback across distribution networks.",
    href: "/solutions/logistics",
  },
];

// The real platform stack, generalized: the Integration & Security Layer
// bridges ZoeConnect's modules to whatever line-of-business system of record
// an organization already runs — an HIS in healthcare, a core banking system
// in finance, an ERP in manufacturing, and so on.
export const architectureLayers = [
  { name: "Your System of Record", detail: "HIS, ERP, core banking, CRM, or SIS — whatever you already run, untouched" },
  { name: "ZoeConnect Integration & Security Layer", detail: "Connector bridges, role-based access, and audit trails" },
  { name: "Six ZoeConnect Modules", detail: "Queue, Content & Signage, Feedback, Loyalty, Incident, and Program Enrollment — configured per department, per branch, per industry" },
];

// Grounded in the real Connector architecture (HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md,
// connector/package.json): built first for Oracle-based hospital HIS, architected
// generically enough to bridge any Oracle-backed system of record.
export const connectorFacts = [
  {
    title: "Dedicated Connector service",
    detail: "A standalone Windows service bridges ZoeConnect's backend to your on-prem system of record — your network is never exposed directly to the cloud.",
  },
  {
    title: "SQL-template allow-list",
    detail: "The Connector only ever executes explicitly registered, reviewed query templates — never arbitrary SQL received over the wire.",
  },
  {
    title: "Local Connector Manager UI",
    detail: "Your own IT team activates, configures, and diagnoses the Connector through a local web UI and system-tray app, without platform engineering support.",
  },
  {
    title: "Two-way sync",
    detail: "Registrations, transactions, billing/deposit data, and reference data sync bidirectionally between your core system and ZoeConnect's modules.",
  },
];

export const securityFeatures = [
  { title: "Role-Based Access Control", detail: "Granular permissions for front-line staff, counters, supervisors, and administrators, enforced across every module." },
  { title: "Full Audit Trails", detail: "Every queue action, feedback submission, and content change is time-stamped and logged for compliance review, in any regulatory framework." },
  { title: "Secure Authentication", detail: "JWT-based session authentication with per-module access guards on every API endpoint." },
  { title: "Module Licensing & Feature Gating", detail: "Each module is independently licensed and feature-flagged, so an organization only runs what it has activated." },
];

// Generalized from ZoeConnect's own "traditional vs. enabled" comparison —
// the same before/after applies to any front-line, service-counter operation.
// Anonymized deployment profiles and published outcomes, not named clients.
// Real, sourced from ZoeConnect/HDSP's own product materials and internal
// architecture documentation -- not invented for this site.
export const deploymentProfiles = [
  {
    label: "Multi-Branch Hospital Chain",
    modules: "Queue, Content & Signage, Feedback",
    detail: "The original deployment context for all three flagship modules, across OPD, IPD, and emergency areas at multiple branch locations.",
  },
  {
    label: "Multi-Disciplinary Therapy Center",
    modules: "Program Enrollment & Case Management",
    detail: "Five therapy disciplines running structured intake, session logging, and multi-party progress review on one longitudinal case record per enrollee.",
  },
  {
    label: "Government & Enterprise Service Counters",
    modules: "Queue, Feedback",
    detail: "Citizen and employee-facing service counters replacing manual token calling with live, auditable digital queuing.",
  },
];

export const publishedOutcomes = [
  { value: "40%", label: "Reduction in OPD waiting time" },
  { value: "100%", label: "Digital patient/customer touchpoints" },
  { value: "Weeks", label: "Typical time to go live, not quarters" },
];

export const comparisonRows = [
  { before: "Manual paper queue & shouting names", after: "Digital queue with live tokens & display calling" },
  { before: "Paper feedback forms, rarely analyzed", after: "Digital feedback captured & analyzed in real time" },
  { before: "Static screens playing the same loop all day", after: "Smart digital signage, centrally managed & live" },
  { before: "Manual, delayed reports", after: "Automated, real-time analytics & reports" },
  { before: "Manual announcements via PA system", after: "Centralized CMS pushes instantly to every screen" },
  { before: "No visibility into customer or visitor sentiment", after: "Real-time satisfaction dashboard, always on" },
];

export const deploymentModels = [
  { name: "On-Premise", detail: "Runs entirely within your own data center, under your existing IT policy." },
  { name: "Private Cloud", detail: "Deployed on your organization's own private cloud infrastructure." },
  { name: "Hybrid", detail: "Cloud-hosted modules with an on-prem Connector bridging to your local system of record." },
  { name: "Multi-Location Deployment", detail: "One platform, centrally managed, consistent across every branch, campus, or property." },
];

export const pricingModel = {
  headline: "Modular pricing, matched to what you actually deploy",
  description:
    "ZoeConnect is priced module by module and rolled out phase by phase — you invest in Queue Management, Digital Signage, and Feedback Management independently or together, and expand into additional modules and industries as your organization's digital strategy matures. There is no published fixed-tier price list; every deployment is scoped to your department count, location count, and chosen deployment model.",
  points: [
    "Pay for the modules you activate, not a bundled suite",
    "Phase-wise rollout — start with one module, add more later",
    "Scales from a single service counter to multi-location, multi-industry deployments",
    "On-premise, private cloud, or hybrid — priced to match your deployment model",
  ],
};

export const faqs = [
  {
    q: "Will ZoeConnect disrupt the systems we already run?",
    a: "No. ZoeConnect is built to work alongside your existing system of record — an HIS, ERP, core banking platform, or CRM — not replace it. The Integration & Security Layer syncs data through a dedicated Connector, so existing workflows continue unchanged.",
  },
  {
    q: "Is ZoeConnect only for hospitals?",
    a: "No. ZoeConnect's modules were proven first in healthcare, but Smart Queue & Service Management, Digital Signage, and Feedback Management are configured for any front-line, service-counter operation — banks, government offices, campuses, retail stores, and more.",
  },
  {
    q: "Do we have to deploy all six modules at once?",
    a: "No. Queue Management, Content & Digital Signage, Feedback Management, Loyalty, Incident Management, and Program Enrollment & Case Management can each be deployed independently or as a fully integrated suite, department by department, at your own pace.",
  },
  {
    q: "What deployment models are supported?",
    a: "On-premise, private cloud, and hybrid deployments are all supported, along with centralized multi-location deployment for organizations with multiple branches, campuses, or properties.",
  },
  {
    q: "How is our data secured?",
    a: "Role-based access control, secure authentication, and full audit trails are enforced across every module, with each module independently licensed and feature-gated per deployment.",
  },
  {
    q: "What's next on the ZoeConnect roadmap?",
    a: "Beyond the six modules live today, ZoeConnect's roadmap includes Role-Specific Dashboards, Resource & Facility Scheduling, Emergency Management, Appointment Management, a Customer Mobile App, Visitor Management, AI Analytics, and Employee Self Service — activated as your organization's digital strategy matures.",
  },
];

export type FeatureItem = { title: string; detail: string };

export type ProductPageContent = {
  slug: string;
  name: string;
  eyebrow: string;
  headline: string;
  description: string;
  icon: string;
  status: "live" | "engineering-complete" | "platform";
  features: FeatureItem[];
  stats: { value: string; label: string }[];
};

export const productPages: ProductPageContent[] = [
  {
    slug: "platform",
    name: "Platform Overview",
    eyebrow: "The ZoeConnect Core",
    headline: "A configurable digital service platform, not a single-purpose app",
    description:
      "ZoeConnect is a modular digital service platform designed to work alongside whatever system of record your organization already runs. Each module solves a specific operational challenge and can be deployed independently or as a fully integrated suite, sitting on one Integration & Security Layer shared by every module and every industry.",
    icon: "LayoutGrid",
    status: "platform",
    features: [
      { title: "System-of-Record-First Architecture", detail: "Every module is built to sync with your existing HIS, ERP, CRM, or core system through the Integration & Security Layer, not to replace it." },
      { title: "Modular, Phase-Wise Rollout", detail: "Deploy any of the six modules independently, department by department, industry by industry." },
      { title: "Role-Based Governance", detail: "Role-based access, audit trails, and per-module licensing are shared across the platform, not reimplemented per module." },
      { title: "Six Modules, One Foundation", detail: "Queue, Content & Signage, Feedback, Loyalty, Incident, and Program Enrollment all run on the same Integration & Security Layer." },
    ],
    stats: [
      { value: "6", label: "Modules live today" },
      { value: "9", label: "Industries configured for" },
      { value: "24x7", label: "Live monitoring & support" },
    ],
  },
  {
    slug: "queue",
    name: "Smart Queue & Service Management",
    eyebrow: "Module 1 · Live",
    headline: "The complete service journey, digitized",
    description:
      "A configurable, intelligent queuing engine that replaces paper tokens and manual calling with a live, auditable digital workflow — from registration through queue generation, live monitoring, counter calls, service, and analytics. Proven first at hospital OPD counters; configured just as cleanly for a bank branch, government office, or retail help desk.",
    icon: "Ticket",
    status: "live",
    features: [
      { title: "Department- & Counter-wise Queues", detail: "Separate queue series per department, service line, or specific staff member — not just a generic single line." },
      { title: "Priority & Emergency Handling", detail: "Priority classes and a dedicated always-on-top emergency queue are built in by default." },
      { title: "Live Reception & Counter Dashboards", detail: "Real-time visibility of every waiting person, with full Call, Recall, Skip, Transfer, Hold, Resume, Complete, and Cancel actions logged instantly." },
      { title: "Queue & Wait-Time Analytics", detail: "Live and historical queue length, department comparisons, average service time, and auto-generated daily/monthly reports." },
      { title: "System-of-Record Integration", detail: "Two-way integration with your existing system of record, with new registrations automatically flowing into the queue engine." },
      { title: "Multi-Location & Multi-Counter", detail: "Manage queue operations across any number of counters, departments, and locations from one platform." },
    ],
    stats: [
      { value: "6", label: "Stages, one digitized service journey" },
      { value: "4", label: "Supported entry points: walk-in, appointment, priority, emergency" },
      { value: "9", label: "Industries the same engine configures for" },
    ],
  },
  {
    slug: "signage",
    name: "Content & Digital Signage Management",
    eyebrow: "Module 2 · Live",
    headline: "One content hub. Every screen, in sync.",
    description:
      "A complete digital signage platform that turns every screen in a facility — waiting areas, service floors, lobbies, and back-of-house — into a branded, informative, always-current touchpoint, built to keep working through network interruptions.",
    icon: "MonitorPlay",
    status: "live",
    features: [
      { title: "Drag-and-Drop Playlists", detail: "Build and reorder screen playlists visually, then assign them to individual screens or entire screen groups in seconds." },
      { title: "Offline Cache & Automatic Sync", detail: "Displays keep running smoothly during network interruptions and re-sync automatically the moment connectivity returns." },
      { title: "Emergency Override", detail: "Push critical alerts instantly to every connected screen, overriding scheduled content facility-wide." },
      { title: "Heartbeat Monitoring & Diagnostics", detail: "Every display continuously reports its health status, so faulty or offline screens are caught before anyone notices." },
      { title: "Live Engagement Widgets", detail: "Live queue widgets, scrolling tickers, and context-specific content, all in one library." },
      { title: "Runs Anywhere", detail: "Android TV, browser-based smart TVs, or any standard display, indoors or outdoors." },
    ],
    stats: [
      { value: "5", label: "Steps from upload to published screen" },
      { value: "9", label: "Industries the same signage engine configures for" },
    ],
  },
  {
    slug: "feedback",
    name: "Experience Feedback Management",
    eyebrow: "Module 3 · Live",
    headline: "From a scan to an actionable insight",
    description:
      "A complete digital feedback journey — from QR-code capture at every touchpoint to structured analytics and reputation management, routing positive responses to public reviews and constructive feedback into an internal resolution workflow.",
    icon: "MessageSquareHeart",
    status: "live",
    features: [
      { title: "Drag-and-Drop Form Builder", detail: "Design multi-page feedback forms visually with 10+ question types — star/emoji ratings, text, dropdowns, file upload, signature, and conditional logic." },
      { title: "QR-Based, Context-Specific Campaigns", detail: "Every QR code links to a location, staff member, or department-specific feedback form, launched and tracked as a campaign." },
      { title: "Public Review Integration", detail: "People who leave a high rating are seamlessly redirected to post a public review." },
      { title: "Internal Resolution Workflow", detail: "Lower ratings route directly into an internal workflow, ensuring every concern is tracked, assigned, and resolved before it reaches a public platform." },
      { title: "Department & Location Analytics", detail: "Granular satisfaction scores by department, staff member, and location, with trend analysis and full export/audit logs." },
      { title: "Multi-Language & Any Device", detail: "Mobile- and tablet-friendly, anonymous or authenticated, in the respondent's preferred language." },
    ],
    stats: [
      { value: "10+", label: "Question types supported" },
      { value: "5", label: "Steps from QR scan to resolved feedback" },
    ],
  },
  {
    slug: "loyalty",
    name: "Loyalty & Rewards Engine",
    eyebrow: "Module 4 · Live",
    headline: "A loyalty engine, bridged directly to your billing",
    description:
      "A full points, cards, campaigns, and redemption engine bridged to core-system billing and deposit data — configurable as patient loyalty, guest loyalty, or customer rewards, deployed independently or alongside Queue and Feedback.",
    icon: "Gift",
    status: "live",
    features: [
      { title: "Points & Card-Tier Engine", detail: "A dedicated point-engine service tracks loyalty points and card-category tiers per person." },
      { title: "Campaigns & Redemption", detail: "Loyalty campaigns and a reward catalog with redemption tracking." },
      { title: "System-of-Record Bridge", detail: "Dedicated bridge services sync loyalty and deposit data with your core system's billing records." },
      { title: "Independently Deployable", detail: "Runs on its own or alongside any of the other five modules, on the same Integration & Security Layer." },
    ],
    stats: [
      { value: "4", label: "Engines: points, cards, campaigns, redemption" },
      { value: "Live", label: "Module status" },
    ],
  },
  {
    slug: "incident",
    name: "Incident & Risk Management",
    eyebrow: "Module 5 · Live",
    headline: "Every incident logged, classified, and closed out",
    description:
      "Incident logging, severity/priority/risk-matrix configuration, and CAPA (corrective and preventive action) workflows — a generic safety and quality engine, not a hospital-only one, deployed independently or alongside any other module.",
    icon: "ShieldAlert",
    status: "live",
    features: [
      { title: "Structured Incident Logging", detail: "Every incident captured with severity, priority, and a configurable risk matrix." },
      { title: "CAPA Workflows", detail: "Corrective and Preventive Action workflows carry each incident from report through resolution." },
      { title: "Dashboards & Analytics", detail: "Incident trends, closure rates, and risk exposure surfaced by department and location." },
      { title: "Full Audit Trail", detail: "Every action on an incident record is logged for compliance review." },
    ],
    stats: [
      { value: "Live", label: "Module status" },
      { value: "9", label: "Industries the same engine configures for" },
    ],
  },
  {
    slug: "enrollment",
    name: "Program Enrollment & Case Management",
    eyebrow: "Module 6 · Live",
    headline: "One record, from intake to case closure",
    description:
      "A structured case lifecycle built first for a multi-disciplinary therapy program: intake and assessment, per-session progress logging against tracked goals, periodic multi-party review with supervisor sign-off, and a final closure summary — generalizable to any structured enrollment or case-management workflow.",
    icon: "ClipboardList",
    status: "live",
    features: [
      { title: "Structured Intake & Assessment", detail: "Multi-section structured assessment forms capture the full intake picture at enrollment, across every discipline or workstream involved." },
      { title: "Session-Based Progress Logging", detail: "Each session or interaction is logged against tracked short- and long-term goals, building a longitudinal record automatically." },
      { title: "Periodic Multi-Party Review", detail: "Combined progress reports pull every contributor's section together for supervisor review and digital sign-off on a set cadence." },
      { title: "Case Closure Summary", detail: "A final closure or discharge summary compiles every discipline's record, validated for completeness before the case is archived." },
      { title: "Goal & Notification Engine", detail: "Automatic reminders for assessments due, reports pending, and goals up for review." },
      { title: "Confidentiality & Audit Controls", detail: "Role-based access and full audit logging enforced on every record, built for sensitive case data from the start." },
    ],
    stats: [
      { value: "Live", label: "Module status" },
      { value: "4", label: "Lifecycle stages: intake, sessions, review, closure" },
    ],
  },
  {
    slug: "document-studio",
    name: "Document & Forms Engine",
    eyebrow: "Underlying Platform Engine",
    headline: "The engine behind digital forms and structured documents",
    description:
      "A document engine, workflow engine, compliance engine, and asset library, built on a purpose-built, framework-agnostic canvas engine — the foundation that Program Enrollment & Case Management and other modules are built on, not a customer-facing module in its own right.",
    icon: "FileStack",
    status: "platform",
    features: [
      { title: "Document & Workflow Engines", detail: "A document engine paired with a workflow engine for approval and review flows on any structured document." },
      { title: "Compliance Engine", detail: "A dedicated compliance engine tracks document-level compliance requirements." },
      { title: "Asset Library", detail: "A shared library for the media and templates used across document workflows." },
      { title: "Purpose-Built Canvas Engine", detail: "Powered by a framework-agnostic scene-graph canvas engine shared with the platform's form-schema system." },
    ],
    stats: [
      { value: "4", label: "Engines: document, workflow, compliance, asset library" },
      { value: "Infra", label: "Underlying every module, not sold separately" },
    ],
  },
  {
    slug: "integration",
    name: "System Integration & Connector",
    eyebrow: "Integration & Security Layer",
    headline: "Connects cleanly with the systems you already run",
    description:
      "A dedicated Windows Connector service bridges ZoeConnect's backend to your on-prem system of record, so your network is never exposed directly to the cloud — enforcing a SQL-template allow-list rather than executing arbitrary queries.",
    icon: "Plug",
    status: "platform",
    features: [
      { title: "Standalone Connector Service", detail: "Runs as a Windows service on your own infrastructure, talking to ZoeConnect's cloud backend over a message-transport protocol." },
      { title: "SQL-Template Allow-List", detail: "The Connector only ever executes explicitly registered, reviewed query templates — never arbitrary SQL received over the wire." },
      { title: "Local Connector Manager UI", detail: "A local web UI and system-tray app let your own IT team activate, configure, and diagnose the Connector themselves." },
      { title: "Two-Way Sync", detail: "Registration, transaction, billing/deposit, and reference data sync bidirectionally between your system of record and ZoeConnect's modules." },
    ],
    stats: [
      { value: "1", label: "Dedicated Connector service, decoupled from the core backend" },
      { value: "Allow-list", label: "SQL execution model — no arbitrary queries" },
    ],
  },
  {
    slug: "developer-apis",
    name: "Developer & Integration APIs",
    eyebrow: "Technical Foundation",
    headline: "REST APIs, built for clean integration",
    description:
      "Open, standards-based REST APIs expose ZoeConnect's queue, display, and feedback data for integration with other systems, with role-based access and full audit trails enforced on every endpoint.",
    icon: "Code2",
    status: "platform",
    features: [
      { title: "REST APIs", detail: "Standards-based REST APIs for clean integration with kiosks, apps, and third-party systems." },
      { title: "Live Queue API", detail: "Real-time queue data can be exposed to kiosks, apps, and other connected systems." },
      { title: "Role-Based Access", detail: "Every API endpoint is gated by the same role-based access control enforced across the platform." },
      { title: "Full Audit Trails", detail: "Every critical API action is logged for compliance and traceability, consistent with the rest of the platform." },
    ],
    stats: [
      { value: "REST", label: "API architecture" },
      { value: "100%", label: "Endpoints covered by role-based access" },
    ],
  },
];

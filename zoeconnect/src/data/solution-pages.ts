export type SolutionPageContent = {
  slug: string;
  name: string;
  eyebrow: string;
  headline: string;
  description: string;
  highlights: { title: string; detail: string }[];
};

// The nine industries ZoeConnect's configurable modules serve today or are
// designed to extend into. Healthcare is presented as the vertical the
// platform was proven in first — one of nine, not the platform's identity.
export const solutionPages: SolutionPageContent[] = [
  {
    slug: "healthcare",
    name: "Healthcare",
    eyebrow: "Industry",
    headline: "Where ZoeConnect's modules were proven first",
    description:
      "Hospitals run multi-department OPD and IPD operations under real patient-experience pressure. ZoeConnect's Queue Management, Digital Signage, and Feedback Management modules deploy independently or together, department by department — the origin point for every module on the platform today.",
    highlights: [
      { title: "Department- & Doctor-wise Queuing", detail: "Configurable queues per department or doctor, live within your existing HIS workflow." },
      { title: "Branded Patient Displays", detail: "Centralized digital signage across waiting areas, OPD, IPD, and OT reinforces a modern facility brand." },
      { title: "Structured Feedback & Compliance Readiness", detail: "QR-driven feedback capture produces auditable records for accreditation review." },
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    eyebrow: "Industry",
    headline: "Front-desk and service-counter operations, unified",
    description:
      "Large organizations run internal service counters, visitor operations, and employee-facing signage that rarely get the same digital investment as customer-facing systems. ZoeConnect brings the same queuing, signage, and feedback architecture in-house.",
    highlights: [
      { title: "Internal Service Desks", detail: "IT help desks, HR service counters, and facilities requests queued and tracked like any other service line." },
      { title: "Campus-Wide Signage", detail: "One content hub manages displays across every building, floor, and department." },
      { title: "Employee Feedback Loops", detail: "QR-based feedback campaigns route straight to the relevant internal team." },
    ],
  },
  {
    slug: "government",
    name: "Government",
    eyebrow: "Industry",
    headline: "Built for high-volume, public-accountability service",
    description:
      "Government service counters manage some of the highest visitor volumes with public accountability for service quality. ZoeConnect's modular, phase-wise rollout lets an agency start with one module and expand at its own pace.",
    highlights: [
      { title: "Scales to Volume", detail: "Any number of counters, departments, and service points on one platform, without disrupting existing case-management systems." },
      { title: "Full Audit Trail", detail: "Every queue action and feedback record is time-stamped and auditable, supporting public accountability requirements." },
      { title: "Phase-Wise Rollout", detail: "Modules can be activated one at a time, matching public-sector procurement and budget cycles." },
    ],
  },
  {
    slug: "education",
    name: "Education",
    eyebrow: "Industry",
    headline: "Campus service operations, digitized",
    description:
      "Campuses run registrar counters, admissions offices, and multi-building facilities simultaneously. ZoeConnect's multi-department, multi-counter architecture fits that structure directly.",
    highlights: [
      { title: "Multi-Department Queuing", detail: "Separate queue series for registrar, admissions, financial aid, and student services across a large campus." },
      { title: "Campus-Wide Signage", detail: "One content hub manages displays across every building and academic block." },
      { title: "Department-Level Feedback Analytics", detail: "Granular satisfaction scoring by department supports service quality review across a large campus." },
    ],
  },
  {
    slug: "manufacturing",
    name: "Manufacturing",
    eyebrow: "Industry",
    headline: "Plant-floor service and safety operations",
    description:
      "Manufacturing facilities run internal service counters, safety signage, and incident workflows across large, multi-shift plant floors. ZoeConnect's queuing, signage, and incident-management modules apply directly.",
    highlights: [
      { title: "Plant-Floor Service Counters", detail: "Tooling requests, maintenance requests, and internal service lines queued and tracked like any front-line operation." },
      { title: "Safety Signage", detail: "Centralized digital signage pushes safety announcements and shift information across every facility screen." },
      { title: "Incident & Risk Workflows", detail: "The Incident & Risk Management module supports structured safety-incident tracking." },
    ],
  },
  {
    slug: "hospitality",
    name: "Hospitality",
    eyebrow: "Industry",
    headline: "Guest experience, orchestrated across every property",
    description:
      "Hospitality groups coordinate guest experience across booking, on-property service, and post-stay engagement. ZoeConnect's queuing, signage, and feedback modules keep that experience consistent across every property.",
    highlights: [
      { title: "Guest-Facing Queuing", detail: "Front-desk, concierge, and service-counter queuing for high-traffic properties." },
      { title: "Branded Property Signage", detail: "Centralized digital signage across lobbies, restaurants, and event spaces, managed from one console." },
      { title: "Guest Feedback & Reputation", detail: "QR-based feedback campaigns route happy guests to public reviews and route concerns to resolution." },
    ],
  },
  {
    slug: "retail",
    name: "Retail",
    eyebrow: "Industry",
    headline: "Store-level service and signage, centrally managed",
    description:
      "Retail chains need consistent service-desk queuing and in-store signage across every location without losing local flexibility. ZoeConnect's multi-location support manages both centrally.",
    highlights: [
      { title: "Store Service-Desk Queuing", detail: "Returns, customer service, and fitting-room queuing tracked like any service-counter operation." },
      { title: "In-Store Digital Signage", detail: "Centralized promotional and wayfinding content pushed consistently across every store." },
      { title: "Store-Level Feedback Analytics", detail: "Compare customer experience consistently across every store location." },
    ],
  },
  {
    slug: "finance",
    name: "Finance",
    eyebrow: "Industry",
    headline: "Branch queuing and customer experience, unified",
    description:
      "Banks, credit unions, and insurers run branch-level queuing and lobby signage that need to feel consistent, secure, and on-brand. ZoeConnect's modules configure directly for regulated financial environments.",
    highlights: [
      { title: "Branch-wise Queuing", detail: "Teller, loan-officer, and service-counter queuing configured per branch." },
      { title: "Lobby & Branch Signage", detail: "Centralized digital signage across every branch lobby, managed from one console." },
      { title: "Customer Feedback & Compliance", detail: "QR-driven feedback capture produces auditable records suited to regulated review." },
    ],
  },
  {
    slug: "logistics",
    name: "Logistics",
    eyebrow: "Industry",
    headline: "Depot and counter operations, made visible",
    description:
      "Logistics and distribution networks run depot counters and driver/customer service points across many locations. ZoeConnect's queuing and signage modules keep that throughput visible to staff and customers alike.",
    highlights: [
      { title: "Depot Counter Queuing", detail: "Driver check-in, customer pickup, and service-counter queuing across a distribution network." },
      { title: "Facility Signage", detail: "Centralized content across depot and facility screens, managed from one console." },
      { title: "Service-Time Analytics", detail: "Average service-time tracking helps depots identify and resolve throughput bottlenecks." },
    ],
  },
];

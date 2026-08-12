/**
 * Drug Indenting integration.
 *
 * Pure port of zoe-platform's `utils/workflow.js` — the canonical
 * stage/role vocabulary and the "which role may act on a request at a
 * given stage" business rule. Values are copied verbatim (same stage
 * strings, same stage→role map, same NEXT_STAGE transitions) since these
 * are exactly what's stored in `drug_requests.current_stage` today and
 * what the old frontend's stage labels expect back unchanged.
 *
 * The source's ROLES enum stays here as the vocabulary for *workflow*
 * roles (doctor/hod/pharmacist/pharmacyhead/dtccommittee/ceo) — a
 * business concept distinct from a ZoeConnect RBAC `Role` name. The
 * mapping between the two lives in `drug-indenting-request-context.ts`.
 */

export const WORKFLOW_ROLES = {
  DOCTOR: 'doctor',
  HOD: 'hod',
  PHARMACIST: 'pharmacist',
  PHARMACY_HEAD: 'pharmacyhead',
  DTC_COMMITTEE: 'dtccommittee',
  CEO: 'ceo',
  ADMIN: 'admin',
} as const;

export type WorkflowRole = typeof WORKFLOW_ROLES[keyof typeof WORKFLOW_ROLES];

export const STAGES = {
  HOD: 'HOD',
  PHARMACIST_INITIAL_REVIEW: 'PharmacistInitialReview',
  PHARMACIST_CORRECTION: 'PharmacistCorrection',
  PHARMACIST: 'Pharmacist',
  PHARMACY_HEAD: 'PharmacyHead',
  PHARMACY_HEAD_REVIEW_2: 'PharmacyHeadReview2',
  DTC_COMMITTEE: 'DTCCommittee',
  DTC_FINAL: 'DTCFinal',
  EMERGENCY_DTC: 'EmergencyDTC',
  CEO: 'CEO',
  PHARMACIST_ORDER: 'PharmacistOrder',
  FINAL: 'Final',
  REJECTED: 'Rejected',
  ORDER_PLACED: 'OrderPlaced',
} as const;

export type Stage = typeof STAGES[keyof typeof STAGES];

export const STAGE_APPROVER_ROLE: Partial<Record<Stage, WorkflowRole>> = {
  [STAGES.HOD]: WORKFLOW_ROLES.HOD,
  [STAGES.PHARMACIST_INITIAL_REVIEW]: WORKFLOW_ROLES.PHARMACIST,
  [STAGES.PHARMACIST_CORRECTION]: WORKFLOW_ROLES.PHARMACIST,
  [STAGES.PHARMACY_HEAD]: WORKFLOW_ROLES.PHARMACY_HEAD,
  [STAGES.PHARMACY_HEAD_REVIEW_2]: WORKFLOW_ROLES.PHARMACY_HEAD,
  [STAGES.DTC_COMMITTEE]: WORKFLOW_ROLES.DTC_COMMITTEE,
  [STAGES.DTC_FINAL]: WORKFLOW_ROLES.DTC_COMMITTEE,
  [STAGES.EMERGENCY_DTC]: WORKFLOW_ROLES.DTC_COMMITTEE,
  [STAGES.CEO]: WORKFLOW_ROLES.CEO,
  [STAGES.PHARMACIST_ORDER]: WORKFLOW_ROLES.PHARMACIST,
};

export function getApproverRoleForStage(stage: string): WorkflowRole | null {
  return (STAGE_APPROVER_ROLE as Record<string, WorkflowRole>)[stage] || null;
}

/** 'dtc' is a legacy alias for 'dtccommittee' some real records use — preserved from source. */
export function workflowRolesMatch(userRole: string, requiredRole: string): boolean {
  if (userRole === requiredRole) return true;
  const DTC_ALIASES = ['dtc', WORKFLOW_ROLES.DTC_COMMITTEE];
  return DTC_ALIASES.includes(userRole) && DTC_ALIASES.includes(requiredRole);
}

export const NEXT_STAGE: Record<string, string> = {
  HOD: 'PharmacistInitialReview',
  PharmacistInitialReview: 'PharmacyHead',
  PharmacyHead: 'DTCCommittee',
  DTCCommittee: 'Pharmacist',
  Pharmacist: 'PharmacyHeadReview2',
  PharmacyHeadReview2: 'DTCFinal',
  PharmacistCorrection: 'PharmacyHeadReview2',
  DTCFinal: 'CEO',
  CEO: 'PharmacistOrder',
  EmergencyDTC: 'PharmacistOrder',
};

export const STAGE_LABELS: Record<string, string> = {
  HOD: 'Head of Department',
  PharmacistInitialReview: 'Pharmacist (Initial Review)',
  PharmacyHead: 'Pharmacy Head',
  DTCCommittee: 'DTC Committee',
  Pharmacist: 'Pharmacist',
  PharmacyHeadReview2: 'Pharmacy Head (Review 2)',
  PharmacistCorrection: 'Pharmacist (Correction Required)',
  DTCFinal: 'DTC Committee (Final)',
  CEO: 'CEO',
  Final: 'Final Approval',
  Rejected: 'Rejected',
  EmergencyDTC: 'DTC Committee (Emergency)',
  PharmacistOrder: 'Pharmacist (Order Placement)',
  OrderPlaced: 'Order Placed',
};

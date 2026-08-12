import type { User } from '../users/entities/user.entity';
import { WORKFLOW_ROLES, WorkflowRole, workflowRolesMatch } from './drug-indenting-workflow.util';

/**
 * Drug Indenting integration.
 *
 * Replaces the source's dynamic `getApproverRoleForStage(stage)` +
 * `rolesMatch(user.role, requiredRole)` check (source: `users.role` is a
 * single free-text column) with an RBAC-permission-backed equivalent: one
 * `DRUG_INDENTING:WORKFLOW:ACT_AS_<ROLE>` permission per workflow role
 * the source recognizes as a stage approver (HOD, PHARMACIST,
 * PHARMACY_HEAD, DTC_COMMITTEE, CEO — DOCTOR never approves anything, only
 * creates requests, so it has no ACT_AS_* permission). A ZoeConnect user
 * can hold more than one of these simultaneously (unlike the source's
 * single-role column), which only ever grants strictly more access than
 * the source model allowed — never less.
 *
 * `workflowRolesMatch` is reused unchanged so the 'dtc'/'dtccommittee'
 * alias handling from the source stays intact conceptually, even though
 * here it's applied to the *required* role only (comparing it against the
 * fixed set of workflow-role flags below, not a stored user.role string).
 */
export interface DrugIndentingRequestContext {
  tenantId: string;
  userId: string;
  workflowRoles: Set<WorkflowRole>;
}

export function buildDrugIndentingContext(user: User): DrugIndentingRequestContext {
  const workflowRoles = new Set<WorkflowRole>();
  if (user.hasPermission('DRUG_INDENTING:WORKFLOW:ACT_AS_HOD')) workflowRoles.add(WORKFLOW_ROLES.HOD);
  if (user.hasPermission('DRUG_INDENTING:WORKFLOW:ACT_AS_PHARMACIST')) workflowRoles.add(WORKFLOW_ROLES.PHARMACIST);
  if (user.hasPermission('DRUG_INDENTING:WORKFLOW:ACT_AS_PHARMACY_HEAD')) workflowRoles.add(WORKFLOW_ROLES.PHARMACY_HEAD);
  if (user.hasPermission('DRUG_INDENTING:WORKFLOW:ACT_AS_DTC_COMMITTEE')) workflowRoles.add(WORKFLOW_ROLES.DTC_COMMITTEE);
  if (user.hasPermission('DRUG_INDENTING:WORKFLOW:ACT_AS_CEO')) workflowRoles.add(WORKFLOW_ROLES.CEO);
  if (user.hasPermission('DRUG_INDENTING:REQUESTS:CREATE')) workflowRoles.add(WORKFLOW_ROLES.DOCTOR);

  return {
    tenantId: user.tenantId,
    userId: user.id,
    workflowRoles,
  };
}

/** Does this context hold a workflow role able to act as `requiredRole` (stage's approver)? */
export function canActAsWorkflowRole(ctx: DrugIndentingRequestContext, requiredRole: string | null): boolean {
  if (!requiredRole) return false;
  for (const held of ctx.workflowRoles) {
    if (workflowRolesMatch(held, requiredRole)) return true;
  }
  return false;
}

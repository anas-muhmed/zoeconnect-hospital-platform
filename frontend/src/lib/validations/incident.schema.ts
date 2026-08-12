import { z } from 'zod';

export const createIncidentSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  typeId: z.string().min(1, 'Type is required'),
  severityCode: z.string().min(1, 'Severity is required'),
  incidentDate: z.string().min(1, 'Incident date is required'),
  department: z.string().min(1, 'Department is required'),
  ward: z.string().optional(),
  location: z.string().optional(),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  immediateAction: z.string().optional(),
  isAnonymous: z.boolean().default(false),
  isNearMiss: z.boolean().default(false),
  isSentinelEvent: z.boolean().default(false),
  patientMrn: z.string().optional(),
  employeeId: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const investigationSchema = z.object({
  findings: z.string().min(10, 'Findings must be at least 10 characters'),
  methodology: z.string().optional(),
});
export type InvestigationInput = z.infer<typeof investigationSchema>;

export const statementSchema = z.object({
  statementType: z.enum(['WITNESS', 'STAFF_INVOLVED', 'EXPERT', 'OTHER']).default('WITNESS'),
  personName: z.string().min(1, 'Person name is required'),
  personRole: z.string().optional(),
  statementText: z.string().min(10, 'Statement must be at least 10 characters'),
  statementDate: z.string().min(1, 'Date is required'),
});
export type StatementInput = z.infer<typeof statementSchema>;

export const rcaSchema = z.object({
  method: z.enum(['FIVE_WHY', 'FISHBONE', 'FAULT_TREE', 'BOWTIE']),
  summary: z.string().optional(),
});
export type RcaInput = z.infer<typeof rcaSchema>;

export const fiveWhySchema = z.object({
  problemStatement: z.string().min(5, 'Problem statement is required'),
  why1: z.string().min(5, 'First why is required'),
  why2: z.string().optional(),
  why3: z.string().optional(),
  why4: z.string().optional(),
  why5: z.string().optional(),
  rootCause: z.string().min(5, 'Root cause is required'),
});
export type FiveWhyInput = z.infer<typeof fiveWhySchema>;

export const capaSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300, 'Title is too long'),
  capaType: z.enum(['CORRECTIVE', 'PREVENTIVE']),
  description: z.string().min(10, 'Description is required'),
  ownerId: z.string().min(1, 'Select an action owner from the list').uuid('Owner ID must be a valid UUID'),
  ownerName: z.string().optional(),
  department: z.string().optional(),
  dueDate: z.string().min(1, 'Due date is required'),
  priorityCode: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});
export type CapaInput = z.infer<typeof capaSchema>;

export const verificationSchema = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED', 'NEED_MORE_EVIDENCE']),
  notes: z.string().optional(),
}).refine((data) => data.outcome === 'APPROVED' || !!data.notes?.trim(), {
  message: 'Notes are required when rejecting or requesting more evidence',
  path: ['notes'],
});
export type VerificationInput = z.infer<typeof verificationSchema>;

export const closureSchema = z.object({
  closureNotes: z.string().min(1, 'Closure notes are required'),
  lessonsLearned: z.string().optional(),
  finalLikelihood: z.number().min(1).max(5).optional(),
  finalImpact: z.number().min(1).max(5).optional(),
  residualRiskAccepted: z.boolean().default(false),
  residualRiskNotes: z.string().optional(),
}).refine((data) => !data.residualRiskAccepted || !!data.residualRiskNotes?.trim(), {
  message: 'Explain why residual risk is accepted',
  path: ['residualRiskNotes'],
});
export type ClosureInput = z.infer<typeof closureSchema>;

export const triageSchema = z.object({
  assignedToId: z.string().uuid().optional().or(z.literal('')),
  priorityCode: z.string().optional(),
  responseSlaHours: z.number().min(1).optional(),
  escalationRequired: z.boolean().default(false),
  escalationRoles: z.array(z.string()).default([]),
  containmentRequired: z.boolean().default(false),
  containmentNotes: z.string().optional(),
  triageNotes: z.string().optional(),
});
export type TriageInput = z.infer<typeof triageSchema>;

export const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty'),
  visibility: z.enum(['PUBLIC', 'INTERNAL']).default('INTERNAL'),
});
export type CommentInput = z.infer<typeof commentSchema>;

// ── Settings ─────────────────────────────────────────────────────────────────

export const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  code: z.string().min(1, 'Code is required').max(50),
  description: z.string().optional(),
  displayOrder: z.number().optional(),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const typeSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Name is required').max(100),
  code: z.string().min(1, 'Code is required').max(50),
  description: z.string().optional(),
  displayOrder: z.number().optional(),
  isActive: z.boolean().default(true),
});
export type TypeInput = z.infer<typeof typeSchema>;

export const severitySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  color: z.string().optional(),
  slaResponseHours: z.number().min(1).optional(),
  slaInvestigationHours: z.number().min(1).optional(),
  slaCapaDays: z.number().min(1).optional(),
  slaClosureDays: z.number().min(1).optional(),
  notifyRoles: z.array(z.string()).default([]),
  displayOrder: z.number().optional(),
  isActive: z.boolean().default(true),
});
export type SeverityInput = z.infer<typeof severitySchema>;

export const notificationRoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  displayOrder: z.number().optional(),
  isActive: z.boolean().default(true),
});
export type NotificationRoleInput = z.infer<typeof notificationRoleSchema>;

export const notificationRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  triggerEvent: z.string().min(1, 'Trigger event is required'),
  notifyRoles: z.array(z.string()).default([]),
  notifyUserIds: z.array(z.string()).default([]),
  channel: z.string().default('PUSH'),
  isActive: z.boolean().default(true),
});
export type NotificationRuleInput = z.infer<typeof notificationRuleSchema>;

import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * CvSettings -- module-wide, admin-tunable parameters for Children's
 * Village. One row per tenant (unlike FeedbackSettings' single global row +
 * unused branch-override slot -- CV has no branch concept, but tenant
 * isolation is load-bearing everywhere else in this module, see
 * childrens-village.module.ts's `createTenantScopedRepositoryProvider`
 * calls, so this follows that instead).
 *
 * `requireAdmissionApproval` (2026-08-03, requested after a real gap was
 * found: `CvStudent.admissionStatus` defaults to 'PENDING' and nothing in
 * the module ever advanced it -- every admission sat at PENDING forever,
 * with no configurable behavior). false = admissions are enrolled
 * immediately (CvAdmissionsService sets admissionStatus straight to
 * 'ENROLLED'), matching what most orgs actually want out of the box. true =
 * admissions stay 'PENDING' until a CV:ADMISSIONS:APPROVE holder approves
 * or rejects them via the new endpoints on CvAdmissionsController.
 */
@Entity('cv_settings')
export class CvSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId: string;

  @Column({ name: 'require_admission_approval', type: 'boolean', default: false })
  requireAdmissionApproval: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}

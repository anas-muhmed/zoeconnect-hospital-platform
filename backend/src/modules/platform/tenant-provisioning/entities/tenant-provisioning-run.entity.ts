import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type ProvisioningRunStatus = 'in_progress' | 'completed' | 'failed';

/**
 * TenantProvisioningRun (Phase 10, Task 10.1).
 *
 * One row per provisioning attempt for one prospective tenant. Deliberately
 * NOT the same thing as the `Tenant` row itself -- `tenantId` starts null
 * and is only set once Step 1 (spec Section 8.1) actually creates the
 * `Tenant` row, so a run that fails before Step 1 completes still has a
 * durable record of what was requested and why it didn't get further.
 *
 * `currentStepNumber` + each row's own `TenantProvisioningStep` rows
 * together are what makes `resume()` possible: on retry, the service
 * re-reads this run's steps, skips every step already `succeeded`, and
 * restarts from the first `pending`/`failed` one. This is a purpose-built
 * step-runner, not built on `document-platform`'s workflow-engine -- that
 * module, on inspection during this phase's pre-flight, turned out to be a
 * document-approval state machine (draft -> review -> approved, driven by
 * explicit human actions), not a generic multi-step process runner with
 * per-step persisted state and automatic resumption. The spec's "build on
 * existing Workflow-engine primitives" assumption did not hold in this
 * codebase; see PHASE_10_ARCHITECTURE_REVIEW.md's Question 6 for the full
 * finding. This entity pair is the minimal, honest substitute.
 */
@Entity('tenant_provisioning_runs')
export class TenantProvisioningRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Set once Step 1 creates the Tenant row; null until then. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'requested_hospital_name', type: 'varchar', length: 255 })
  requestedHospitalName: string;

  /**
   * ZoeConnect Identity Architecture Migration, Phase 6: made nullable
   * (`1788600000000-MakeProvisioningSubdomainOptional.ts`) -- subdomains
   * are no longer required or used for organization identity/login, so
   * most new runs will have this null. Preserved for historical/backward
   * -compatibility reporting only (see
   * TenantProvisioningService.buildProvisioningSummary(), which never
   * derives `loginUrl` from this field).
   */
  @Column({ name: 'requested_subdomain', type: 'varchar', length: 255, nullable: true })
  requestedSubdomain: string | null;

  @Column({ name: 'requested_admin_username', type: 'varchar', length: 100 })
  requestedAdminUsername: string;

  @Column({ name: 'requested_admin_email', type: 'varchar', length: 255 })
  requestedAdminEmail: string;

  @Column({ name: 'requested_admin_full_name', type: 'varchar', length: 255, nullable: true })
  requestedAdminFullName: string | null;

  @Column({ type: 'varchar', length: 20, default: 'in_progress' })
  status: ProvisioningRunStatus;

  @Column({ name: 'current_step_number', type: 'int', default: 1 })
  currentStepNumber: number;

  /** Last step's error message, surfaced for the admin UI (Task 10.7) -- not a stack trace, kept human-readable. */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** Username/identifier of whoever called the admin API (Task 10.7) -- audit trail, not authorization. */
  @Column({ name: 'triggered_by', type: 'varchar', length: 255, nullable: true })
  triggeredBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}

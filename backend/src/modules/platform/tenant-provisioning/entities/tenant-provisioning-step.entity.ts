import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { TenantProvisioningRun } from './tenant-provisioning-run.entity';

export type ProvisioningStepStatus = 'pending' | 'in_progress' | 'succeeded' | 'failed';

/**
 * TenantProvisioningStep (Phase 10, Task 10.1) — one row per pipeline step
 * per run (spec Section 8.1's 10 steps), created up front in `pending`
 * status when a run is created, so the full plan is visible even before
 * execution starts. `resultData` stores each step's non-sensitive output
 * (e.g. the created Tenant's id, the generated pairing credential's id --
 * never the pairing key's plaintext, see TenantConnectorPairing) so a
 * later step, or the admin UI, can reference what an earlier step did
 * without re-deriving it.
 */
@Entity('tenant_provisioning_steps')
export class TenantProvisioningStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @ManyToOne(() => TenantProvisioningRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: TenantProvisioningRun;

  @Column({ name: 'step_number', type: 'int' })
  stepNumber: number;

  @Column({ name: 'step_name', type: 'varchar', length: 100 })
  stepName: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ProvisioningStepStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'result_data', type: 'jsonb', nullable: true })
  resultData: Record<string, unknown> | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}

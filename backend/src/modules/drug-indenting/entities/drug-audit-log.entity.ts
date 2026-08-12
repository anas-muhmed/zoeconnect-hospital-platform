import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** Drug Indenting integration. Ports `audit_logs` (the workflow's compliance trail — who did what, from which stage to which). Tenant-scoped. */
@Entity('drug_audit_logs')
export class DrugAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ name: 'performed_by', type: 'uuid' })
  performedBy: string;

  @Column({ name: 'from_stage', type: 'varchar', length: 50, nullable: true })
  fromStage: string | null;

  @Column({ name: 'to_stage', type: 'varchar', length: 50, nullable: true })
  toStage: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'logged_at' })
  loggedAt: Date;
}

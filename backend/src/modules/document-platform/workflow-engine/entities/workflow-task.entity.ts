import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('hdsp_document_workflow_tasks')
export class WorkflowTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string; // The DocumentInstance this task is tracking

  @Column({ name: 'workflow_state', type: 'varchar', length: 100 })
  workflowState: string; // The state requiring action, e.g. 'review'

  @Column({ name: 'action', type: 'varchar', length: 100, nullable: true })
  action: string; // The required action or label

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'pending' })
  status: 'pending' | 'claimed' | 'completed' | 'cancelled';

  // Hierarchical Assignment
  @Column({ name: 'assigned_role', type: 'varchar', length: 100, nullable: true })
  assignedRole: string | null;

  @Column({ name: 'assigned_department', type: 'varchar', length: 100, nullable: true })
  assignedDepartment: string | null;

  @Column({ name: 'assigned_team', type: 'varchar', length: 100, nullable: true })
  assignedTeam: string | null;

  @Column({ name: 'due_date', type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'sla_minutes', type: 'int', nullable: true })
  slaMinutes: number | null;

  @Column({ name: 'escalation_level', type: 'int', default: 0 })
  escalationLevel: number;

  @Column({ name: 'escalation_rule', type: 'varchar', length: 100, nullable: true })
  escalationRule: string | null;

  @Column({ name: 'assigned_user_id', type: 'uuid', nullable: true })
  assignedUserId: string | null; // Null if it's a role/team queue

  @Column({ name: 'claimed_by_user_id', type: 'uuid', nullable: true })
  claimedByUserId: string | null; // Who pulled it from the queue

  @Column({ name: 'completed_by_user_id', type: 'uuid', nullable: true })
  completedByUserId: string | null; // Who actually completed it

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

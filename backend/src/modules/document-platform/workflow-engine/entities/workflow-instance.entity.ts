import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('hdsp_document_workflow_instances')
export class WorkflowInstanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workflow_template_id', type: 'uuid' })
  workflowTemplateId: string;

  @Column({ name: 'document_instance_id', type: 'uuid', unique: true })
  documentInstanceId: string;

  @Column({ name: 'current_state', type: 'varchar', length: 100 })
  currentState: string;

  @Column({ name: 'current_revision', type: 'int', default: 1 })
  currentRevision: number;

  @Column({ name: 'started_at', type: 'timestamp' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'current_assignee', type: 'varchar', length: 100, nullable: true })
  currentAssignee: string | null;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'active' })
  status: 'active' | 'completed' | 'cancelled' | 'suspended';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

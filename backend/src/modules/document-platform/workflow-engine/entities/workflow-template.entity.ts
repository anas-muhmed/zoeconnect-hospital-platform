import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { WorkflowDefinition } from '../models/workflow-definition';

@Entity('hdsp_document_workflow_templates')
export class WorkflowTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_type_id', type: 'varchar', length: 100 })
  documentTypeId: string; // The form/document type this workflow applies to

  @Column({ name: 'version_no', type: 'int', default: 1 })
  versionNo: number; // Workflow templates version independently of Form schemas

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'draft' })
  status: 'draft' | 'published' | 'archived';

  @Column({ type: 'jsonb' })
  definition: WorkflowDefinition; // The declarative DSL

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

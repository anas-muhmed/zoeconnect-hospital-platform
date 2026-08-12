import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export interface SignatureRequirement {
  intent: string; // e.g. AUTHOR, REVIEWER
  count: number;  // e.g. 1, 2
  role?: string;  // e.g. Doctor, Nurse
}

export interface CompliancePolicy {
  signaturesRequired: SignatureRequirement[];
  requirePdfLock?: boolean;
  watermarkType?: 'NONE' | 'DRAFT' | 'APPROVED_ONLY';
}

@Entity('hdsp_document_compliance_profiles')
export class ComplianceProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string; // e.g., 'Standard NABH', 'Default', 'High Risk Surgical'

  // Hierarchical resolution keys
  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'department_code', type: 'varchar', length: 50, nullable: true })
  departmentCode: string | null;

  @Column({ name: 'document_type_id', type: 'varchar', length: 100, nullable: true })
  documentTypeId: string | null;

  @Column({ name: 'workflow_template_id', type: 'uuid', nullable: true })
  workflowTemplateId: string | null;

  // Precedence order (higher number = higher priority override)
  @Column({ name: 'precedence', type: 'int', default: 0 })
  precedence: number;

  @Column({ type: 'jsonb' })
  policy: CompliancePolicy;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

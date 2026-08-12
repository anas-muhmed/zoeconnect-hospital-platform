import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvReport } from './cv-report.entity';

@Entity('cv_report_exports')
@Index('IDX_CV_REPORT_EXPORTS_TENANT', ['tenantId'])
export class CvReportExport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'report_id', type: 'uuid', nullable: true })
  reportId: string | null;

  @Column({ name: 'format', type: 'varchar', length: 20 })
  // e.g. PDF, CSV, EXCEL
  format: string;

  @Column({ name: 'status', type: 'varchar', length: 50 })
  // e.g. PENDING, PROCESSING, COMPLETED, FAILED
  status: string;

  @Column({ name: 'file_url', type: 'varchar', length: 1024, nullable: true })
  fileUrl: string | null;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvReport, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'report_id' })
  report: CvReport;
}

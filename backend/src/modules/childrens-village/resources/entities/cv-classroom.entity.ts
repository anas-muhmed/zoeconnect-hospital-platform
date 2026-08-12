import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('cv_classrooms')
@Index('IDX_CV_CLASSROOMS_TENANT', ['tenantId'])
export class CvClassroom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'room_type', type: 'varchar', length: 50 })
  // e.g. STANDARD, SENSORY, THERAPY, PLAYROOM
  roomType: string;

  @Column({ name: 'capacity', type: 'int' })
  capacity: number;

  @Column({ name: 'accessibility_features', type: 'jsonb', nullable: true })
  // e.g. ['WHEELCHAIR_RAMP', 'HOIST', 'BRAILLE_SIGNAGE']
  accessibilityFeatures: string[];

  @Column({ name: 'assigned_teacher_id', type: 'uuid', nullable: true })
  assignedTeacherId: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Phase 8 (Resources) additions -- the maintenance-window edge case from
   * the design spec's original `cv_resources` proposal, added here instead
   * (see the Phase 8 migration's header for why `cv_classrooms` is the FK
   * target rather than a new table). `null`/`null` (the default for every
   * existing row) means "no maintenance scheduled" -- inert until set.
   */
  @Column({ name: 'maintenance_from', type: 'timestamp', nullable: true })
  maintenanceFrom: Date | null;

  @Column({ name: 'maintenance_to', type: 'timestamp', nullable: true })
  maintenanceTo: Date | null;

  @Column({ name: 'maintenance_notes', type: 'text', nullable: true })
  maintenanceNotes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

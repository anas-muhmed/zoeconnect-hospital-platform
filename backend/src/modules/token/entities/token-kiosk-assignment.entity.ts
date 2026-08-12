import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { TokenKiosk } from './token-kiosk.entity';
import { TokenLocation } from './token-location.entity';

export type AssignmentType = 'SERVICE_CENTER' | 'LOCATION';

/**
 * TokenKioskAssignment --- links a kiosk to a service center or location.
 *
 * For SERVICE_CENTER_BASED branches:
 *   assignment_type = 'SERVICE_CENTER', service_center_id, department_id, intrabranchid populated.
 *
 * For LOCATION_BASED branches:
 *   assignment_type = 'LOCATION', location_id populated.
 *
 * A MULTIPLE kiosk has exactly one assignment.
 * A SINGLE kiosk can have multiple assignments (the "merge" feature adds rows here).
 * A service center can appear in multiple kiosks simultaneously.
 */
@Entity('token_kiosk_assignments')
export class TokenKioskAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'kiosk_id' })
  kioskId: string;

  @ManyToOne(() => TokenKiosk, (k) => k.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kiosk_id' })
  kiosk: TokenKiosk;

  @Column({ name: 'branch_id', length: 30 })
  branchId: string;

  @Column({ name: 'assignment_type', length: 20 })
  assignmentType: AssignmentType;

  // -- Service Center mode fields -------------------------------------------
  @Column({ type: 'varchar', name: 'department_id', length: 30, nullable: true })
  departmentId: string | null;

  @Column({ type: 'varchar', name: 'department_name', length: 255, nullable: true })
  departmentName: string | null;

  @Column({ type: 'varchar', name: 'service_center_id', length: 30, nullable: true })
  serviceCenterId: string | null;

  @Column({ type: 'varchar', name: 'service_center_name', length: 255, nullable: true })
  serviceCenterName: string | null;

  @Column({ type: 'varchar', name: 'intrabranchid', length: 30, nullable: true })
  intrabranchId: string | null;

  // -- Location mode fields -------------------------------------------------
  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @ManyToOne(() => TokenLocation, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: TokenLocation | null;

  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'merged_at', type: 'timestamptz', nullable: true })
  mergedAt: Date | null;

  @Column({ type: 'varchar', name: 'merged_by', length: 100, nullable: true })
  mergedBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

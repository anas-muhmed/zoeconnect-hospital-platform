import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { LockScope } from '../attendance.types';

/**
 * AttendanceGovernanceLock — Phase 5
 *
 * Represents a payroll/governance lock that prevents automatic recalculation
 * from overwriting finalized attendance records.
 *
 * scope=EMPLOYEE  → employeeCode + periodFrom/To required; departmentCode null
 * scope=DEPARTMENT → departmentCode + periodFrom/To required; employeeCode null
 * scope=ALL       → periodFrom/To required; both codes null (blanket freeze)
 */
@Entity('attendance_governance_locks')
@Index(['isActive', 'periodFrom', 'periodTo'])
@Index(['employeeCode', 'isActive'])
@Index(['departmentCode', 'isActive'])
export class AttendanceGovernanceLock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'scope', type: 'varchar', length: 20 })
  scope: LockScope;

  /** Populated when scope=EMPLOYEE */
  @Column({ name: 'employee_code', type: 'varchar', length: 40, nullable: true })
  employeeCode: string | null;

  /** Populated when scope=DEPARTMENT */
  @Column({ name: 'department_code', type: 'varchar', length: 40, nullable: true })
  departmentCode: string | null;

  @Column({ name: 'period_from', type: 'date' })
  periodFrom: Date;

  @Column({ name: 'period_to', type: 'date' })
  periodTo: Date;

  /** Who triggered the lock (userId, system name, etc.) */
  @Column({ name: 'locked_by', type: 'varchar', length: 120 })
  lockedBy: string;

  @Column({ name: 'locked_at', type: 'timestamptz' })
  lockedAt: Date;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  /** Set to false by unlock() instead of hard deleting, for audit trail */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A9) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). scope=EMPLOYEE/
   * DEPARTMENT rows are tenant-owned but unresolvable via local join;
   * scope=ALL rows are genuinely ownerless by design (hospital-wide
   * freeze) and need an explicit Stage B policy decision, not derivation.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

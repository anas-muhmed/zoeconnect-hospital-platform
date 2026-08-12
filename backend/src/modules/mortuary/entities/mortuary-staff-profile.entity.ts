import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A).
 *
 * Per the approved Q2 decision, Mortuary's two original identity tables
 * (`admin` and `users`) are NOT ported as their own tables — accounts
 * become ordinary ZoeConnect `User` rows (tenant-scoped, RBAC-governed)
 * so there is exactly one identity system in ZoeConnect, not two.
 *
 * This entity carries ONLY the Mortuary-specific fields the old `users`
 * table had that ZoeConnect's `User` entity does not: `employeeId`,
 * `department` (which the original code used AS the staff member's role —
 * see authController.js `loginUser`'s `role: user.department` — preserved
 * here as data; the actual RBAC permission grant is derived from it in
 * Stage D, not stored redundantly), phone numbers, and the
 * approve/reject-before-first-login workflow.
 *
 * Only staff hired via the original `users` table (department = 'M Staff'
 * or 'House Keeping') get a row here. Original `admin`-table accounts
 * (Admin/SuperAdmin) become plain ZoeConnect Users with a Mortuary Admin
 * role grant and need no extension row — the old `admin` table had no
 * fields beyond what `User` already covers.
 */
@Entity('mortuary_staff_profiles')
@Unique(['tenantId', 'employeeId'])
export class MortuaryStaffProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to the ZoeConnect `User` this profile extends. One-to-one. */
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'varchar', length: 100 })
  employeeId: string;

  /**
   * Preserves the original string values ('M Staff' / 'House Keeping')
   * rather than inventing new constant names, so a future data-migration
   * script can copy this column verbatim without a translation table.
   */
  @Column({ type: 'enum', enum: ['M Staff', 'House Keeping'] })
  department: 'M Staff' | 'House Keeping';

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone1: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone2: string | null;

  @Column({
    name: 'approval_status',
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  approvalStatus: 'pending' | 'approved' | 'rejected';

  @Column({ name: 'admin_remarks', type: 'varchar', length: 500, nullable: true })
  adminRemarks: string | null;

  @Column({ name: 'password_reset_requested', type: 'boolean', default: false })
  passwordResetRequested: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

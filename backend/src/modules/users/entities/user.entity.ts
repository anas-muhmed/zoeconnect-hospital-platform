import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToMany, JoinTable, BeforeInsert, BeforeUpdate,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Role } from '../../rbac/entities/role.entity';
import { Permission } from '../../rbac/entities/permission.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ZoeConnect Identity Architecture Migration, Phase 4: globally unique
  // again (case-insensitive) -- `uq_users_username_ci` / `uq_users_email_ci`
  // functional unique indexes on LOWER(username)/LOWER(email), see
  // 1788500000000-GlobalIdentityUniqueness.ts. This reverses Tenant-Scoped
  // User Identity Task 5's `uq_users_tenant_username`/`uq_users_tenant_email`
  // composite constraints, which no longer exist. The bare `unique: true`
  // here was never schema-authoritative anyway (`synchronize: false`
  // everywhere in this project) and case-sensitive besides, so it's left off
  // rather than misdescribe the real (case-insensitive) constraint to a
  // reader of this file.
  @Column({ length: 100 })
  username: string;

  @Column({ length: 255 })
  email: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A4) — originally nullable.
   * Tenant-Scoped User Identity, Task 5: backfilled (Task 1) and now
   * `NOT NULL` at the DB level (1783880000000-...ts). No relation/FK yet
   * (deferred to Stage B); kept here purely so the entity stays in sync
   * with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: false })
  tenantId: string;

  @Column({ name: 'password_hash', length: 255 })
  @Exclude()
  passwordHash: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({
  name: 'his_employee_code',
  type: 'varchar',
  length: 50,
  nullable: true,
  })
  hisEmployeeCode: string | null;


  @ManyToMany(() => Role, { eager: true, cascade: ['insert', 'update'] })
  @JoinTable({
    name: 'user_roles',
    joinColumn:        { name: 'user_id',  referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id',  referencedColumnName: 'id' },
  })
  roles: Role[];

  /** Permissions granted directly to this user (on top of whatever their roles provide) */
  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: 'user_permissions',
    joinColumn:        { name: 'user_id',       referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  directPermissions: Permission[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'must_change_password', default: false })
  mustChangePassword: boolean;

  @Column({ name: 'is_recovery_account', default: false })
  isRecoveryAccount: boolean;

  @Column({ name: 'account_expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'failed_login_count', type: 'smallint', default: 0 })
  @Exclude()
  failedLoginCount: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  @Exclude()
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  @Exclude()
  passwordChangedAt: Date | null;

  @Column({ name: 'password_reset_at', type: 'timestamptz', nullable: true })
  @Exclude()
  passwordResetAt: Date | null;

  @Column({ name: 'password_reset_expires_at', type: 'timestamptz', nullable: true })
  @Exclude()
  passwordResetExpiresAt: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ── Computed helpers ──────────────────────────────────────────────────────
  get isLocked(): boolean {
    return !!this.lockedUntil && this.lockedUntil > new Date();
  }

  get isSuperAdmin(): boolean {
    return this.roles?.some((r) => r.name === 'SUPER_ADMIN') ?? false;
  }

  get permissionKeys(): string[] {
    const set = new Set<string>();
    // Permissions inherited via roles
    for (const role of this.roles ?? []) {
      for (const p of role.permissions ?? []) {
        set.add(`${p.moduleCode}:${p.resource}:${p.action}`);
      }
    }
    // Permissions granted directly to this user
    for (const p of this.directPermissions ?? []) {
      set.add(`${p.moduleCode}:${p.resource}:${p.action}`);
    }
    return [...set];
  }

  hasPermission(permissionKey: string): boolean {
    if (this.isSuperAdmin) return true;
    return this.permissionKeys.includes(permissionKey);
  }
}

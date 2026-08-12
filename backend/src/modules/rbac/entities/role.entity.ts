import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToMany, JoinTable, OneToMany,
} from 'typeorm';
import { Permission } from './permission.entity';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Tenant-Scoped User Identity, Task 5: no longer globally unique at the DB
  // level -- superseded by the composite `uq_roles_tenant_name` constraint
  // (see 1783880000000-TenantScopedIdentityCompositeConstraints.ts).
  @Column({ length: 100 })
  name: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A4) — originally nullable.
   * Tenant-Scoped User Identity, Task 5: backfilled (Task 1) and now
   * `NOT NULL` at the DB level (1783880000000-...ts). No relation/FK yet
   * (deferred to Stage B); kept here purely so the entity stays in sync
   * with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: false })
  tenantId: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @Column({ name: 'module_code', type: 'varchar', length: 50, nullable: true })
  moduleCode: string | null;

  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn:        { name: 'role_id',       referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

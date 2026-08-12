import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';

/**
 * Drug Indenting integration (ZoeConnect delivery phase).
 *
 * Mirrors Mortuary's `MortuaryStaffProfile` pattern: the source's own
 * `users` table (bigint PK, own bcrypt password, own `role` string) is
 * NOT ported as its own table — accounts become ordinary ZoeConnect
 * `User` rows, RBAC-governed. This entity carries only what the source
 * `users` table had that ZoeConnect's `User` lacks and the workflow
 * genuinely needs:
 *
 *  - `department` — drives real business logic (requests.js's HOD-routing:
 *    a doctor's submission auto-routes to whichever user has role HOD in
 *    the *same* department; no department match means the HOD stage is
 *    skipped entirely). Not a display field, load-bearing.
 *  - `userLoginId` — the source's separate human-facing login identifier
 *    (distinct from `email`, unique in source). Preserved for continuity;
 *    not currently read by any ported business rule.
 *
 * Deliberately NOT stored here: `role` ('doctor'/'hod'/'pharmacist'/...).
 * In the source, role was a free-text column checked with string
 * comparisons everywhere. In ZoeConnect, "what workflow role does this
 * user have" is answered by which `DRUG_INDENTING_*` RBAC role is
 * attached to their `User` (see `drug-indenting-request-context.ts`) —
 * storing role a second time here would be a second, driftable source of
 * truth for exactly the kind of fact RBAC is supposed to own.
 */
@Entity('drug_indenting_staff_profiles')
@Unique(['tenantId', 'userLoginId'])
export class DrugIndentingStaffProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_login_id', type: 'varchar', length: 50 })
  userLoginId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  department: string | null;

  @Column({ name: 'is_approved', type: 'boolean', default: true })
  isApproved: boolean;

  @Column({ name: 'force_password_reset', type: 'boolean', default: false })
  forcePasswordReset: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

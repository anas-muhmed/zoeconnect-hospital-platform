import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cleans up duplicate (tenant_id, name) rows in `roles`.
 *
 * Reported live: a single tenant's Roles & Permissions page showed
 * INCIDENT_MANAGER five times, all identical (same description/module,
 * 0 users, 10 permissions each). This should be impossible going forward
 * -- `uq_roles_tenant_name` (UNIQUE ("tenant_id","name"), added by
 * 1783880000000-TenantScopedIdentityCompositeConstraints.ts) is a real,
 * plain (not partial/expression) unique constraint, and
 * 1788800000000-AddIncidentManagerRole.ts's INSERT already targets it with
 * `ON CONFLICT ("tenant_id","name") DO NOTHING` -- so a single tracked
 * `migration:run` cannot produce this. The likely cause is the insert
 * being executed more than once outside TypeORM's own tracking (e.g. the
 * statement copied into a DB client and re-run by hand while
 * troubleshooting the earlier "No migrations are pending" issue, before
 * the migration was registered in data-source.ts) -- each execution is
 * still idempotent per the ON CONFLICT clause, so exactly how five rows
 * resulted couldn't be confirmed without direct DB access, but the fix
 * here is unconditional either way: de-duplicate now, and the existing
 * unique constraint prevents it from recurring for any future insert that
 * goes through it.
 *
 * For every (tenant_id, name) group with more than one row, keeps the
 * OLDEST row (by created_at) and deletes the rest. Safe to do unlike a
 * `users` cleanup would be: `role_permissions.role_id` and
 * `user_roles.role_id` both have `ON DELETE CASCADE`
 * (1700000001000-CreatePlatformSchema.ts,
 * 1700000016000-UserRolesManyToMany.ts), so deleting a duplicate role row
 * automatically cleans up its permission grants and any (in this case,
 * zero) membership rows with it -- no manual reassignment needed. Not
 * scoped to INCIDENT_MANAGER specifically, since the same defensive
 * cleanup is correct for any role name that ended up duplicated the same
 * way, for the same reason.
 */
export class DeduplicateRoles1788900000000 implements MigrationInterface {
  name = 'DeduplicateRoles1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles" r
      WHERE r."id" NOT IN (
        SELECT DISTINCT ON ("tenant_id", "name") "id"
        FROM "roles"
        ORDER BY "tenant_id", "name", "created_at" ASC
      )
    `);
  }

  public async down(): Promise<void> {
    // Deleted duplicates are, by definition, indistinguishable copies of a
    // row that still exists -- nothing to restore.
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 001 — Platform Schema
 * Creates: roles, permissions, role_permissions, users
 * This is the foundation schema required before any module can function.
 */
export class CreatePlatformSchema1700000001000 implements MigrationInterface {
  name = 'CreatePlatformSchema1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enable UUID extension ──────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // ── module_registry ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "module_registry" (
        "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
        "code"            VARCHAR(50) NOT NULL,
        "name"            VARCHAR(100) NOT NULL,
        "route"           VARCHAR(200) NOT NULL,
        "version"         VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
        "is_active"       BOOLEAN      NOT NULL DEFAULT false,
        "license_required" BOOLEAN     NOT NULL DEFAULT true,
        "display_order"   SMALLINT     NOT NULL DEFAULT 0,
        "icon"            VARCHAR(100),
        "description"     TEXT,
        "roles_json"      JSONB        NOT NULL DEFAULT '[]',
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_module_registry" PRIMARY KEY ("id"),
        CONSTRAINT "uq_module_registry_code" UNIQUE ("code")
      )
    `);

    // ── roles ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"        VARCHAR(100) NOT NULL,
        "description" TEXT,
        "is_system"   BOOLEAN      NOT NULL DEFAULT false,
        "module_code" VARCHAR(50)  REFERENCES "module_registry"("code") ON DELETE SET NULL,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_roles" PRIMARY KEY ("id"),
        CONSTRAINT "uq_roles_name" UNIQUE ("name")
      )
    `);

    // ── permissions ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "module_code" VARCHAR(50)  NOT NULL,
        "resource"    VARCHAR(100) NOT NULL,
        "action"      VARCHAR(50)  NOT NULL,
        "description" TEXT,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_permissions" UNIQUE ("module_code", "resource", "action")
      )
    `);

    // ── role_permissions (junction) ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id"       UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "permission_id" UUID NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        "granted_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_role_permissions" PRIMARY KEY ("role_id", "permission_id")
      )
    `);

    // ── users ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        "username"             VARCHAR(100) NOT NULL,
        "email"                VARCHAR(255) NOT NULL,
        "password_hash"        VARCHAR(255) NOT NULL,
        "full_name"            VARCHAR(255),
        "role_id"              UUID         NOT NULL REFERENCES "roles"("id"),
        "is_active"            BOOLEAN      NOT NULL DEFAULT true,
        "must_change_password" BOOLEAN      NOT NULL DEFAULT false,
        "failed_login_count"   SMALLINT     NOT NULL DEFAULT 0,
        "locked_until"         TIMESTAMPTZ,
        "last_login_at"        TIMESTAMPTZ,
        "password_changed_at"  TIMESTAMPTZ,
        "created_by"           UUID         REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_username" UNIQUE ("username"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    // ── settings ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "settings" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "module"      VARCHAR(50)  NOT NULL,
        "key"         VARCHAR(100) NOT NULL,
        "value"       TEXT         NOT NULL,
        "data_type"   VARCHAR(20)  NOT NULL DEFAULT 'string',
        "description" TEXT,
        "updated_by"  UUID         REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_settings" PRIMARY KEY ("id"),
        CONSTRAINT "uq_settings_module_key" UNIQUE ("module", "key")
      )
    `);

    // ── Indexes ───────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX "idx_users_role_id"    ON "users"("role_id")`);
    await queryRunner.query(`CREATE INDEX "idx_users_is_active"  ON "users"("is_active")`);
    await queryRunner.query(`CREATE INDEX "idx_perms_module"     ON "permissions"("module_code")`);
    await queryRunner.query(`CREATE INDEX "idx_settings_module"  ON "settings"("module")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "settings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "module_registry" CASCADE`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kiosk Desktop device registration (Electron kiosk shell,
 * kiosk-desktop/), mirroring the Connector's activation-code + instance
 * pattern (see 1783840000000-CreateTenantProvisioning.ts's
 * tenant_connector_pairings and 1785900000000-CreateConnectorInstances.ts)
 * rather than inventing a new device-identity scheme. Deliberately
 * separate tables from the Connector's -- a kiosk till is a distinct kind
 * of unattended device with its own lifecycle (label + assigned kiosk
 * page URL per pairing, no Oracle/HIS involvement) -- but the same shape:
 * a single-use `kiosk_pairings` activation-code row that a
 * `kiosk_devices` row gets minted from on redemption.
 *
 * No hard FK constraints against tenants/kiosk_pairings, per this
 * migration file's existing logical-FK-only convention.
 */
export class CreateKioskDevices1786300000000 implements MigrationInterface {
  name = 'CreateKioskDevices1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kiosk_pairings" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"         uuid NOT NULL,
        "activation_code_hash" varchar(255) NOT NULL,
        "label"             varchar(100),
        "kiosk_url"         varchar(500) NOT NULL,
        "status"            varchar(20) NOT NULL DEFAULT 'pending',
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "created_by"        uuid,
        "revoked_at"        timestamptz,
        "expires_at"        timestamptz,
        CONSTRAINT "CHK_kiosk_pairings_status"
          CHECK ("status" IN ('pending', 'active', 'revoked'))
      );

      CREATE INDEX IF NOT EXISTS "idx_kiosk_pairings_tenant"
      ON "kiosk_pairings" ("tenant_id");

      CREATE TABLE IF NOT EXISTS "kiosk_devices" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"         uuid NOT NULL,
        "pairing_id"        uuid NOT NULL,
        "label"             varchar(100),
        "kiosk_url"         varchar(500) NOT NULL,
        "status"            varchar(20) NOT NULL DEFAULT 'registered',
        "app_version"       varchar(40),
        "hostname"          varchar(255),
        "last_heartbeat_at" timestamptz,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "disabled_at"       timestamptz,
        "revoked_at"        timestamptz,
        CONSTRAINT "CHK_kiosk_devices_status"
          CHECK ("status" IN ('registered', 'online', 'offline', 'disabled', 'revoked'))
      );

      CREATE INDEX IF NOT EXISTS "idx_kiosk_devices_tenant"
      ON "kiosk_devices" ("tenant_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "kiosk_devices";
      DROP TABLE IF EXISTS "kiosk_pairings";
    `);
  }
}

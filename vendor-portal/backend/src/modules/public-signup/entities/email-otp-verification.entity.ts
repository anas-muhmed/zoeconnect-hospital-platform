import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

// Public Self-Service Signup (2026-07-31) -- backs the marketing site's new
// "Sign Up" flow: a member of the public verifies control of an email
// address via a one-time code before being allowed to self-provision a
// cloud tenant (CloudTenantsService.provision() -- the exact same pipeline
// the Vendor Portal admin's "Provision Cloud Tenant" button uses, so a
// self-service signup shows up in the Cloud Tenants list identically).
//
// One row per OTP request (not one row per email) -- mirrors this
// codebase's password-reset-request convention (a fresh row per attempt,
// not an upsert) so the full request history stays inspectable.
@Entity('email_otp_verifications')
export class EmailOtpVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  email: string;

  // sha256 hex of the 6-digit code -- not bcrypt: this is a short-lived,
  // rate-limited, single-use numeric code (not a long-lived credential), so
  // a fast, unsalted-but-per-row hash is an appropriate/standard tradeoff
  // for this class of secret, same reasoning webhook HMACs in this codebase
  // use sha256 rather than bcrypt.
  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  // Set once register() successfully calls CloudTenantsService.provision()
  // with this verification -- prevents a single verified code from being
  // used to provision more than one tenant.
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'smallint', default: 0 })
  attempts: number;

  @CreateDateColumn({ name: 'requested_at' })
  requestedAt: Date;
}

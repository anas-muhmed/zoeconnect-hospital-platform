import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type VendorRole = 'ADMIN' | 'STAFF';

@Entity('vendor_users')
export class VendorUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  username: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 128 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 32, default: 'STAFF' })
  role: VendorRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Short-lived token for password reset (stored as bcrypt hash) */
  @Index()
  @Column({ name: 'reset_token', type: 'varchar', length: 128, nullable: true })
  resetToken: string | null;

  /** Token expiry — 1 hour from issuance */
  @Column({ name: 'reset_token_expires_at', type: 'timestamptz', nullable: true })
  resetTokenExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

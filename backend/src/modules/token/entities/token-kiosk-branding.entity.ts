import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

export type FontSizeMode = 'NORMAL' | 'LARGE' | 'EXTRA_LARGE';

/**
 * TokenKioskBranding --- per-branch kiosk and display board branding.
 *
 * One row per branch (branch_id is unique).
 * All kiosks and display boards within a branch share the same branding.
 *
 * welcome_message is a JSON map: { "en": "Welcome", "ar": "----------", "ml": "---------------------" }
 * available_langs is the list of language codes shown on the kiosk language selector.
 */
@Entity('token_kiosk_branding')
export class TokenKioskBranding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', length: 30, unique: true })
  branchId: string;

  @Column({ type: 'varchar', name: 'hospital_name', length: 255, nullable: true })
  hospitalName: string | null;

  @Column({ type: 'varchar', name: 'logo_url', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ name: 'primary_color', length: 20, default: '#059669' })
  primaryColor: string;

  @Column({ name: 'secondary_color', length: 20, default: '#0f172a' })
  secondaryColor: string;

  @Column({ type: 'varchar', name: 'background_url', length: 500, nullable: true })
  backgroundUrl: string | null;

  /** Map of lang code --- welcome message string */
  @Column({ name: 'welcome_message', type: 'jsonb', default: { en: 'Welcome' } })
  welcomeMessage: Record<string, string>;

  @Column({ name: 'available_langs', type: 'text', array: true, default: ['en'] })
  availableLangs: string[];

  @Column({ name: 'font_size_mode', length: 20, default: 'NORMAL' })
  fontSizeMode: FontSizeMode;

  @Column({ name: 'footer_text', type: 'text', nullable: true })
  footerText: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'varchar', name: 'updated_by', length: 100, nullable: true })
  updatedBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;
}

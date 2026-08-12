import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { CardCategory } from './card-category.entity';

@Entity('loyalty_accounts')
export class LoyaltyAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_mrn', length: 50, unique: true })
  patientMrn: string;

  @Column({ name: 'patient_name', length: 255 })
  patientName: string;

  @Column({ name: 'patient_mobile', type: 'varchar', length: 20, nullable: true })
  patientMobile: string | null;

  @Column({ name: 'patient_dob', type: 'date', nullable: true })
  patientDob: string | null;

  @Column({ name: 'patient_gender', type: 'varchar', length: 1, nullable: true })
  patientGender: string | null;

  @Column({ name: 'card_number', length: 30, unique: true })
  cardNumber: string;

  @Column({ name: 'card_category_id', type: 'uuid' })
  cardCategoryId: string;

  @ManyToOne(() => CardCategory, { eager: true })
  @JoinColumn({ name: 'card_category_id' })
  category: CardCategory;

  @Column({ name: 'total_lifetime_spend', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalLifetimeSpend: number;

  @Column({ name: 'total_points_earned', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalPointsEarned: number;

  @Column({ name: 'total_points_redeemed', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalPointsRedeemed: number;

  @Column({ name: 'total_points_expired', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalPointsExpired: number;

  @Column({ name: 'available_points', type: 'numeric', precision: 14, scale: 2, default: 0 })
  availablePoints: number;

  @Column({ name: 'card_value_balance', type: 'numeric', precision: 12, scale: 2, default: 0 })
  cardValueBalance: number;

  @Column({ name: 'status', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true, default: null })
  notes: string | null;

  @Column({ name: 'enrolled_by', type: 'uuid', nullable: true })
  enrolledBy: string | null;  // null = auto-enrolled by HIS sync

  /** Branch this account belongs to (Oracle orgstructure.id). Defaults to '2' (ALMAS). */
  @Column({ name: 'branch_id', type: 'varchar', length: 30, nullable: true, default: '2' })
  branchId: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A7) -- nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'enrolled_at' })
  enrolledAt: Date;

  @Column({ name: 'last_transaction_at', type: 'timestamptz', nullable: true })
  lastTransactionAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

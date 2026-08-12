import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A). Ports `billing`, tenant-scoped.
 * Staff-concession fields (`staffName`/`staffEmployeeId`/etc.) are kept as
 * plain denormalized snapshot columns exactly as in the source — they
 * record who a staff concession applied to at billing time, independent
 * of that staff member's current profile, and changing that to a live FK
 * would be a behavior change, not an architecture port.
 */
@Entity('mortuary_billing')
export class MortuaryBilling {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'body_id', type: 'uuid' })
  bodyId: string;

  @Column({ name: 'cabin_allocation_id', type: 'uuid', nullable: true })
  cabinAllocationId: string | null;

  @Column({ name: 'total_amount', type: 'real', default: 0, nullable: true })
  totalAmount: number | null;

  @Column({ name: 'discount_amount', type: 'real', default: 0, nullable: true })
  discountAmount: number | null;

  @Column({ name: 'discount_reason', type: 'text', nullable: true })
  discountReason: string | null;

  @Column({ name: 'concession_authority_id', type: 'uuid', nullable: true })
  concessionAuthorityId: string | null;

  @Column({ name: 'net_amount', type: 'real', default: 0, nullable: true })
  netAmount: number | null;

  @Column({ name: 'services_amount', type: 'real', default: 0, nullable: true })
  servicesAmount: number | null;

  @Column({ type: 'varchar', length: 50, default: 'Pending', nullable: true })
  status: string | null;

  @Column({ name: 'settled_at', type: 'timestamp', nullable: true })
  settledAt: Date | null;

  @Column({ name: 'first_day_charge', type: 'numeric', precision: 10, scale: 2, nullable: true })
  firstDayCharge: string | null;

  @Column({ name: 'extra_hours', type: 'int', nullable: true })
  extraHours: number | null;

  @Column({ name: 'hourly_rate', type: 'numeric', precision: 10, scale: 2, nullable: true })
  hourlyRate: string | null;

  @Column({ name: 'additional_hour_charges', type: 'numeric', precision: 10, scale: 2, nullable: true })
  additionalHourCharges: string | null;

  @Column({ name: 'total_hours', type: 'int', nullable: true })
  totalHours: number | null;

  @Column({ name: 'advance_amount', type: 'numeric', precision: 10, scale: 2, nullable: true })
  advanceAmount: string | null;

  @Column({ name: 'staff_concession', type: 'smallint', default: 0, nullable: true })
  staffConcession: number | null;

  @Column({ name: 'staff_name', type: 'varchar', length: 255, nullable: true })
  staffName: string | null;

  @Column({ name: 'staff_employee_id', type: 'varchar', length: 100, nullable: true })
  staffEmployeeId: string | null;

  @Column({ name: 'staff_address', type: 'text', nullable: true })
  staffAddress: string | null;

  @Column({ name: 'staff_phone', type: 'varchar', length: 20, nullable: true })
  staffPhone: string | null;

  @Column({ name: 'staff_relation', type: 'varchar', length: 100, nullable: true })
  staffRelation: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

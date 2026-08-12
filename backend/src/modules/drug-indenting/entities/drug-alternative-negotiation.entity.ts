import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** Drug Indenting integration. Ports `drug_alternative_negotiations` (Pharmacy Head's rate negotiations). Tenant-scoped. */
@Entity('drug_alternative_negotiations')
export class DrugAlternativeNegotiation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'alternative_id', type: 'uuid' })
  alternativeId: string;

  @Column({ name: 'negotiated_mrp', type: 'numeric', precision: 10, scale: 2, nullable: true })
  negotiatedMrp: string | null;

  @Column({ name: 'negotiated_rate', type: 'numeric', precision: 10, scale: 2, nullable: true })
  negotiatedRate: string | null;

  @Column({ name: 'negotiated_gst', type: 'numeric', precision: 5, scale: 2, nullable: true })
  negotiatedGst: string | null;

  @Column({ name: 'negotiated_scheme_qty', type: 'int', nullable: true })
  negotiatedSchemeQty: number | null;

  @Column({ name: 'negotiated_scheme_offer', type: 'varchar', length: 200, nullable: true })
  negotiatedSchemeOffer: string | null;

  @Column({ name: 'negotiated_net_rate', type: 'numeric', precision: 10, scale: 2, nullable: true })
  negotiatedNetRate: string | null;

  @Column({ name: 'negotiated_profit_margin', type: 'numeric', precision: 10, scale: 2, nullable: true })
  negotiatedProfitMargin: string | null;

  @Column({ name: 'negotiated_absolute_margin', type: 'numeric', precision: 10, scale: 2, nullable: true })
  negotiatedAbsoluteMargin: string | null;

  @Column({ name: 'negotiated_total_margin', type: 'numeric', precision: 10, scale: 2, nullable: true })
  negotiatedTotalMargin: string | null;

  @Column({ name: 'negotiated_by', type: 'uuid', nullable: true })
  negotiatedBy: string | null;

  @Column({ name: 'negotiated_at', type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  negotiatedAt: Date | null;

  @Column({ name: 'negotiation_remarks', type: 'varchar', length: 1000, nullable: true })
  negotiationRemarks: string | null;
}

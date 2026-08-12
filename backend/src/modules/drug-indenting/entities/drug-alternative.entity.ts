import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** Drug Indenting integration. Ports `drug_alternatives` (the pharmacist comparison-sheet rows). Tenant-scoped. */
@Entity('drug_alternatives')
export class DrugAlternative {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'brand_name', type: 'varchar', length: 200 })
  brandName: string;

  @Column({ type: 'varchar', length: 200 })
  manufacturer: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  marketer: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  consultant: string | null;

  @Column({ name: 'introduced_on', type: 'varchar', length: 100, nullable: true })
  introducedOn: string | null;

  @Column({ name: 'consultant_present_stock', type: 'int', nullable: true })
  consultantPresentStock: number | null;

  @Column({ name: 'purchase_quantity', type: 'int', nullable: true })
  purchaseQuantity: number | null;

  @Column({ name: 'sale_quantity', type: 'int', nullable: true })
  saleQuantity: number | null;

  @Column({ name: 'sale_qty', type: 'int', nullable: true })
  saleQty: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pack: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  mrp: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  rate: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  qty: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  offer: string | null;

  @Column({ name: 'negotiated_rate', type: 'numeric', precision: 10, scale: 2, nullable: true })
  negotiatedRate: string | null;

  @Column({ name: 'mrp_per_pack', type: 'numeric', precision: 10, scale: 2, nullable: true })
  mrpPerPack: string | null;

  @Column({ name: 'rate_per_pack', type: 'numeric', precision: 10, scale: 2, nullable: true })
  ratePerPack: string | null;

  @Column({ name: 'gst_percent', type: 'numeric', precision: 5, scale: 2, nullable: true })
  gstPercent: string | null;

  @Column({ name: 'markup_margin', type: 'numeric', precision: 10, scale: 2, nullable: true })
  markupMargin: string | null;

  @Column({ name: 'scheme_qty', type: 'int', nullable: true })
  schemeQty: number | null;

  @Column({ name: 'scheme_offer', type: 'varchar', length: 200, nullable: true })
  schemeOffer: string | null;

  @Column({ name: 'net_rate', type: 'numeric', precision: 10, scale: 2, nullable: true })
  netRate: string | null;

  @Column({ name: 'total_margin', type: 'numeric', precision: 10, scale: 2, nullable: true })
  totalMargin: string | null;

  @Column({ name: 'profit_margin', type: 'numeric', precision: 10, scale: 2, nullable: true })
  profitMargin: string | null;

  @Column({ name: 'absolute_margin', type: 'numeric', precision: 10, scale: 2, nullable: true })
  absoluteMargin: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  stock: string | null;

  @Column({ name: 'existing_drug_details', type: 'varchar', length: 500, nullable: true })
  existingDrugDetails: string | null;

  @Column({ name: 'transaction_history', type: 'varchar', length: 500, nullable: true })
  transactionHistory: string | null;

  @Column({ name: 'margin_comparison', type: 'varchar', length: 500, nullable: true })
  marginComparison: string | null;

  @Column({ name: 'sales_data', type: 'varchar', length: 500, nullable: true })
  salesData: string | null;

  @Column({ name: 'stock_usage', type: 'varchar', length: 500, nullable: true })
  stockUsage: string | null;

  @Column({ name: 'comparison_type', type: 'varchar', length: 20, nullable: true })
  comparisonType: string | null;

  @Column({ name: 'is_final_selected', type: 'boolean', default: false })
  isFinalSelected: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  refer: string | null;

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

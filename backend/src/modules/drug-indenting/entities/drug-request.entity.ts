import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Drug Indenting integration. Ports `drug_requests` (the module's central
 * table — 001_initial_schema.sql, verified column-by-column).
 *
 * Deliberate divergence from the Mortuary precedent, evidence-based not
 * copied blindly: Mortuary's source schema had ZERO foreign-key
 * constraints between its own domain tables (verified in Stage B). Drug
 * Indenting's source schema is the opposite — `doctor_id`, `hod_id`, and
 * every other `*_by`/`*_id` identity reference explicitly
 * `REFERENCES users(user_id)`, and `drug_alternatives`/
 * `drug_alternative_negotiations` explicitly cascade. Preserving that
 * referential integrity (mapped onto ZoeConnect's `users`/sibling tables)
 * is the faithful port here; dropping it would be losing a real
 * guarantee the source relied on, not neutral.
 */
@Entity('drug_requests')
export class DrugRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  // ── Ownership / routing ──────────────────────────────────────────────
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'created_by_role', type: 'varchar', length: 50, default: 'Doctor' })
  createdByRole: string;

  @Column({ name: 'hod_id', type: 'uuid', nullable: true })
  hodId: string | null;

  // ── Medical representative (promotional requests only) ──────────────
  @Column({ name: 'med_rep_name', type: 'varchar', length: 200, nullable: true })
  medRepName: string | null;

  @Column({ name: 'med_rep_email', type: 'varchar', length: 200, nullable: true })
  medRepEmail: string | null;

  @Column({ name: 'med_rep_phone', type: 'varchar', length: 50, nullable: true })
  medRepPhone: string | null;

  // ── Drug details ──────────────────────────────────────────────────────
  @Column({ name: 'request_type', type: 'varchar', length: 100 })
  requestType: string;

  @Column({ name: 'formulary_request_type', type: 'varchar', length: 50, nullable: true })
  formularyRequestType: string | null;

  @Column({ name: 'request_source_type', type: 'varchar', length: 20, default: 'PROMOTIONAL' })
  requestSourceType: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ name: 'brand_name', type: 'varchar', length: 200 })
  brandName: string;

  @Column({ name: 'generic_name', type: 'varchar', length: 200 })
  genericName: string;

  @Column({ name: 'dose_strength', type: 'varchar', length: 100 })
  doseStrength: string;

  @Column({ name: 'dosage_form', type: 'varchar', length: 100 })
  dosageForm: string;

  @Column({ type: 'varchar', length: 200 })
  manufacturer: string;

  @Column({ type: 'varchar', length: 200 })
  marketer: string;

  @Column({ name: 'existing_brands', type: 'varchar', length: 500, nullable: true })
  existingBrands: string | null;

  @Column({ name: 'existing_generic_data', type: 'text', nullable: true })
  existingGenericData: string | null;

  @Column({ name: 'ai_content', type: 'text', nullable: true })
  aiContent: string | null;

  @Column({ name: 'medicine_quantity', type: 'int', nullable: true })
  medicineQuantity: number | null;

  @Column({ name: 'clinical_justification', type: 'text' })
  clinicalJustification: string;

  @Column({ name: 'expected_patients_pm', type: 'int', nullable: true })
  expectedPatientsPm: number | null;

  @Column({ name: 'cost_reduction_benefit', type: 'boolean', default: false })
  costReductionBenefit: boolean;

  // ── Workflow state ────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 50, default: 'Pending' })
  status: string;

  @Column({ name: 'current_stage', type: 'varchar', length: 50, default: 'PharmacyHead' })
  currentStage: string;

  @Column({ name: 'is_emergency', type: 'boolean', default: false })
  isEmergency: boolean;

  @Column({ name: 'is_reverted', type: 'boolean', default: false })
  isReverted: boolean;

  @Column({ name: 'revert_count', type: 'int', default: 0 })
  revertCount: number;

  // ── Stage remarks/timestamps ──────────────────────────────────────────
  @Column({ name: 'approved_by_hod', type: 'boolean', default: false })
  approvedByHod: boolean;

  @Column({ name: 'hod_remarks', type: 'varchar', length: 1000, nullable: true })
  hodRemarks: string | null;

  @Column({ name: 'hod_action_timestamp', type: 'timestamp', nullable: true })
  hodActionTimestamp: Date | null;

  @Column({ name: 'pharmacist_remarks', type: 'varchar', length: 1000, nullable: true })
  pharmacistRemarks: string | null;

  @Column({ name: 'pharmacist2_remarks', type: 'varchar', length: 1000, nullable: true })
  pharmacist2Remarks: string | null;

  @Column({ name: 'ph_review_remarks', type: 'text', nullable: true })
  phReviewRemarks: string | null;

  @Column({ name: 'ph_remarks', type: 'varchar', length: 1000, nullable: true })
  phRemarks: string | null;

  @Column({ name: 'ph_remarks2', type: 'varchar', length: 1000, nullable: true })
  phRemarks2: string | null;

  @Column({ name: 'ph_review2_remarks', type: 'varchar', length: 2000, nullable: true })
  phReview2Remarks: string | null;

  @Column({ name: 'ph_final_recommendation', type: 'text', nullable: true })
  phFinalRecommendation: string | null;

  @Column({ name: 'dtc_remarks', type: 'varchar', length: 1000, nullable: true })
  dtcRemarks: string | null;

  @Column({ name: 'dtc_final_remarks', type: 'varchar', length: 1000, nullable: true })
  dtcFinalRemarks: string | null;

  @Column({ name: 'dtc_selected_brand', type: 'varchar', length: 500, nullable: true })
  dtcSelectedBrand: string | null;

  @Column({ name: 'dtc_selected_category', type: 'varchar', length: 100, nullable: true })
  dtcSelectedCategory: string | null;

  @Column({ name: 'dtc_selection_reasons', type: 'text', nullable: true })
  dtcSelectionReasons: string | null;

  @Column({ name: 'dtc_recommendation_notes', type: 'text', nullable: true })
  dtcRecommendationNotes: string | null;

  @Column({ name: 'dtc_reviewed_by', type: 'uuid', nullable: true })
  dtcReviewedBy: string | null;

  @Column({ name: 'dtc_reviewed_at', type: 'timestamp', nullable: true })
  dtcReviewedAt: Date | null;

  @Column({ name: 'dtc_reviewed_by_name', type: 'varchar', length: 500, nullable: true })
  dtcReviewedByName: string | null;

  @Column({ name: 'dtc_review_signature', type: 'varchar', length: 1000, nullable: true })
  dtcReviewSignature: string | null;

  @Column({ name: 'dtc_final_selection_notes', type: 'varchar', length: 1000, nullable: true })
  dtcFinalSelectionNotes: string | null;

  @Column({ name: 'dtc_final_recommendations', type: 'text', nullable: true })
  dtcFinalRecommendations: string | null;

  @Column({ name: 'ceo_remarks', type: 'varchar', length: 1000, nullable: true })
  ceoRemarks: string | null;

  @Column({ name: 'final_selected_alternative_id', type: 'uuid', nullable: true })
  finalSelectedAlternativeId: string | null;

  @Column({ name: 'final_selected_brand', type: 'varchar', length: 500, nullable: true })
  finalSelectedBrand: string | null;

  @Column({ name: 'final_selected_category', type: 'varchar', length: 100, nullable: true })
  finalSelectedCategory: string | null;

  @Column({ name: 'final_selection_reasons', type: 'text', nullable: true })
  finalSelectionReasons: string | null;

  @Column({ name: 'final_recommendation_notes', type: 'text', nullable: true })
  finalRecommendationNotes: string | null;

  // ── Revert tracking ───────────────────────────────────────────────────
  @Column({ name: 'revert_remarks', type: 'varchar', length: 4000, nullable: true })
  revertRemarks: string | null;

  @Column({ name: 'reverted_by', type: 'uuid', nullable: true })
  revertedBy: string | null;

  @Column({ name: 'reverted_at', type: 'timestamp', nullable: true })
  revertedAt: Date | null;

  @Column({ name: 'last_corrected_at', type: 'timestamp', nullable: true })
  lastCorrectedAt: Date | null;

  @Column({ name: 'last_corrected_by', type: 'uuid', nullable: true })
  lastCorrectedBy: string | null;

  // ── Inventory / order tracking ────────────────────────────────────────
  @Column({ name: 'inventory_added', type: 'boolean', default: false })
  inventoryAdded: boolean;

  @Column({ name: 'inventory_added_at', type: 'timestamp', nullable: true })
  inventoryAddedAt: Date | null;

  @Column({ name: 'inventory_added_by', type: 'uuid', nullable: true })
  inventoryAddedBy: string | null;

  @Column({ name: 'inventory_item_name', type: 'varchar', length: 500, nullable: true })
  inventoryItemName: string | null;

  @Column({ name: 'inventory_received', type: 'boolean', default: false })
  inventoryReceived: boolean;

  @Column({ name: 'inventory_received_at', type: 'timestamp', nullable: true })
  inventoryReceivedAt: Date | null;

  @Column({ name: 'inventory_received_by', type: 'uuid', nullable: true })
  inventoryReceivedBy: string | null;

  // ── Timestamps ────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'effective_created_at', type: 'timestamp', nullable: true })
  effectiveCreatedAt: Date | null;
}

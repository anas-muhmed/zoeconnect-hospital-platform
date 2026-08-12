import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export type ImportJobStatus =
  | 'pending'
  | 'ocr'
  | 'layout'
  | 'classifying'
  | 'generating'
  | 'suggestions'
  | 'review'
  | 'finalized'
  | 'failed';

export interface OcrWord {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  pageIndex: number;
}

export interface OcrPage {
  pageIndex: number;
  text: string;
  words: OcrWord[];
  imageWidth: number;
  imageHeight: number;
}

export interface LayoutElement {
  id: string;
  kind: 'label' | 'field_box' | 'checkbox' | 'radio_option' | 'table' | 'signature_area' | 'image' | 'title' | 'section_header';
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  pageIndex: number;
  children?: string[]; // child element IDs for grouped elements
  associatedLabelId?: string;
}

export interface ClassifiedField {
  id: string;
  layoutElementId: string;
  pageIndex: number;
  label: string;
  fieldKey: string;
  componentType: string;
  confidence: number;       // 0.0 – 1.0
  needsReview: boolean;     // confidence < 0.7
  classifierSource: 'ai' | 'rule' | 'fallback';
  boundingBox: { x: number; y: number; width: number; height: number };
  suggestedProps: Record<string, unknown>;
  alternativeSuggestions?: Array<{ componentType: string; confidence: number }>;
}

export interface FormSuggestion {
  id: string;
  fieldKey: string;
  suggestionType: 'required' | 'validation' | 'options' | 'fieldType' | 'lookup';
  suggestedValue: unknown;
  reason: string;
  accepted: boolean | null; // null = pending
}

@Entity('import_jobs')
export class ImportJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: ImportJobStatus;

  @Column({ type: 'varchar', length: 120 })
  originalFileName: string;

  @Column({ type: 'varchar', length: 64 })
  mimeType: string;

  /** Raw binary of the original uploaded file stored for side-by-side comparison. */
  @Column({ type: 'bytea', nullable: true })
  originalFileBytes: Buffer | null;

  /** Number of pages detected */
  @Column({ type: 'int', default: 1 })
  pageCount: number;

  @Column({ type: 'jsonb', nullable: true })
  ocrResult: OcrPage[] | null;

  @Column({ type: 'jsonb', nullable: true })
  layoutElements: LayoutElement[] | null;

  @Column({ type: 'jsonb', nullable: true })
  classifiedFields: ClassifiedField[] | null;

  @Column({ type: 'jsonb', nullable: true })
  generatedSchema: unknown | null;

  @Column({ type: 'jsonb', nullable: true })
  suggestions: FormSuggestion[] | null;

  /** Overall AI confidence score for the whole document (mean of field confidences) */
  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  overallConfidence: number | null;

  /** Error message if status = failed */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /** AI provider used for classification */
  @Column({ type: 'varchar', length: 64, nullable: true })
  aiProvider: string | null;

  /** FK to the document created after finalization */
  @Column({ type: 'uuid', nullable: true })
  finalizedDocumentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

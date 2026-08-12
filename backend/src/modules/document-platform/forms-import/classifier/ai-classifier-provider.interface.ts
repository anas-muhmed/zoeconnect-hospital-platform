import { LayoutElement, ClassifiedField } from '../entities/import-job.entity';

/**
 * IAiClassifierProvider — abstraction over AI models used for semantic
 * classification of extracted form fields.
 *
 * Implementations:
 *  - GeminiClassifierProvider   (default — Google Gemini Pro)
 *  - OpenAiClassifierProvider   (drop-in alternative — GPT-4o)
 *  - ClaudeClassifierProvider   (drop-in alternative — Claude 3.5 Sonnet)
 *  - RuleBasedClassifierProvider (offline fallback, no API key required)
 *
 * ADR-015 extension: the import pipeline lives under /forms/import/...
 * The AI classifier is injected via NestJS DI using this token.
 */
export interface IAiClassifierProvider {
  /**
   * Classify each layout element into an ZoeConnect component type.
   *
   * @param elements   Structured layout elements from the LayoutAnalyzer.
   * @param context    Optional document context (title, specialty, etc.).
   * @returns          Classified fields with confidence scores.
   */
  classify(
    elements: LayoutElement[],
    context?: ClassificationContext,
  ): Promise<ClassifiedField[]>;

  /** Human-readable name of the underlying model, for audit logs. */
  readonly providerName: string;
}

export interface ClassificationContext {
  documentTitle?: string;
  specialty?: string;   // e.g. 'nursing', 'dental', 'emergency'
  language?: string;
}

export const IAiClassifierProvider = 'IAiClassifierProvider';

/** Component types the AI may produce — must be keys in the ComponentRegistry. */
export const KNOWN_COMPONENT_TYPES = [
  'textbox',
  'textarea',
  'label',
  'checkbox',
  'radio',
  'dropdown',
  'date',
  'number',
  'table',
  'repeat-section',
  'signature',
  'body_diagram',
  'dental_chart',
  'burn_assessment',
  'svg_annotation_layer',
] as const;

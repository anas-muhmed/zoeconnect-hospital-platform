import { Injectable } from '@nestjs/common';
import { IAiClassifierProvider, ClassificationContext } from './ai-classifier-provider.interface';
import { LayoutElement, ClassifiedField } from '../entities/import-job.entity';

/**
 * RuleBasedClassifierProvider — deterministic, offline fallback classifier.
 *
 * Used when:
 *  1. No AI API key is configured.
 *  2. The Gemini/OpenAI call fails (network error, quota exceeded, etc.).
 *  3. Gemini returns low confidence for a field — this re-classifies that field.
 *
 * This provider always sets classifierSource = 'rule' and produces conservative
 * confidence scores (max 0.85 for clear matches, 0.5 for ambiguous).
 */
@Injectable()
export class RuleBasedClassifierProvider implements IAiClassifierProvider {
  readonly providerName = 'rule-based';

  async classify(elements: LayoutElement[], _context?: ClassificationContext): Promise<ClassifiedField[]> {
    return elements
      .filter((el) => el.kind === 'field_box' || el.kind === 'label' || el.kind === 'radio_option' || el.kind === 'signature_area')
      .map((el) => this.classifyElement(el));
  }

  classifyElement(el: LayoutElement): ClassifiedField {
    // Strip trailing colon before matching to avoid word-boundary issues
    const raw = el.text.toLowerCase().trim();
    const t = raw.endsWith(':') ? raw.slice(0, -1).trim() : raw;
    const { type, confidence, props, alternatives } = this.matchRules(t, el);

    return {
      id: `cf-${el.id}`,
      layoutElementId: el.id,
      pageIndex: el.pageIndex,
      label: el.text.replace(/:$/, '').trim(),
      fieldKey: this.toFieldKey(el.text),
      componentType: type,
      confidence,
      needsReview: confidence < 0.7,
      classifierSource: 'rule',
      boundingBox: el.boundingBox,
      suggestedProps: props,
      alternativeSuggestions: alternatives,
    };
  }

  private matchRules(
    text: string,
    el: LayoutElement,
  ): { type: string; confidence: number; props: Record<string, unknown>; alternatives: Array<{ componentType: string; confidence: number }> } {
    // Signature
    if (el.kind === 'signature_area' || /signature|sign here|authoriz/i.test(text)) {
      return { type: 'signature', confidence: 0.85, props: { label: text }, alternatives: [] };
    }

    // Radio group (M/F, yes/no inline options)
    if (el.kind === 'radio_option') {
      return { type: 'radio', confidence: 0.75, props: { label: text }, alternatives: [{ componentType: 'checkbox', confidence: 0.5 }] };
    }

    // Date patterns
    if (/\b(date|dob|date of birth|admission date|discharge date|born|birth)\b/i.test(text)) {
      return { type: 'textbox', confidence: 0.85, props: { label: text, inputType: 'date' }, alternatives: [] };
    }

    // Number/age/weight/height/vitals
    if (/\b(age|weight|height|bmi|bp|blood pressure|temperature|pulse|spo2|hr|rr|gcs|glasgow)\b/i.test(text)) {
      return { type: 'textbox', confidence: 0.82, props: { label: text, inputType: 'number' }, alternatives: [] };
    }

    // Gender / sex → radio
    if (/\b(gender|sex|m\s*\/\s*f)\b/i.test(text)) {
      return {
        type: 'radio', confidence: 0.85,
        props: { label: text, options: ['Male', 'Female', 'Other'] },
        alternatives: [{ componentType: 'dropdown', confidence: 0.6 }],
      };
    }

    // Dropdown patterns
    if (/\b(department|ward|designation|religion|nationality|marital|blood group|type|category|status)\b/i.test(text)) {
      return { type: 'dropdown', confidence: 0.80, props: { label: text, options: [] }, alternatives: [{ componentType: 'textbox', confidence: 0.5 }] };
    }

    // Checkbox (yes/no single boolean)
    if (/\b(yes|no|allergic|diabetic|hypertensive|pregnant|smoker)\b/i.test(text)) {
      return { type: 'checkbox', confidence: 0.78, props: { label: text }, alternatives: [] };
    }

    // Long text / diagnosis / notes
    if (/\b(diagnos|complaint|histor|remark|note|observation|comment|detail|description|finding|advice|prescription|plan|management)/i.test(text)) {
      return { type: 'textarea', confidence: 0.82, props: { label: text, rows: 4 }, alternatives: [] };
    }

    // Medical special components
    if (/body diagram|body chart|anatomical|pain location/i.test(text)) {
      return { type: 'body_diagram', confidence: 0.80, props: { label: text }, alternatives: [] };
    }
    if (/dental chart|tooth|teeth/i.test(text)) {
      return { type: 'dental_chart', confidence: 0.82, props: { label: text }, alternatives: [] };
    }
    if (/burn|lund|browder|tbsa/i.test(text)) {
      return { type: 'burn_assessment', confidence: 0.82, props: { label: text }, alternatives: [] };
    }

    // Table / repeat section
    if (/\b(table|medication|drugs|vitals chart|lab|investigation|test)\b/i.test(text)) {
      return { type: 'table', confidence: 0.72, props: { label: text }, alternatives: [{ componentType: 'repeat-section', confidence: 0.60 }] };
    }

    // Name patterns — high confidence textbox
    if (/\b(name|patient name|doctor name|referred|consultant)\b/i.test(text)) {
      return { type: 'textbox', confidence: 0.85, props: { label: text }, alternatives: [] };
    }

    // Wide field box — likely a text input
    if (el.kind === 'field_box' && el.boundingBox.width > 200 && el.boundingBox.height < 40) {
      return { type: 'textbox', confidence: 0.55, props: { label: '' }, alternatives: [{ componentType: 'textarea', confidence: 0.40 }] };
    }

    // Tall field box — likely textarea
    if (el.kind === 'field_box' && el.boundingBox.height > 60) {
      return { type: 'textarea', confidence: 0.58, props: { label: '' }, alternatives: [{ componentType: 'textbox', confidence: 0.38 }] };
    }

    // Generic fallback
    return { type: 'textbox', confidence: 0.45, props: { label: text }, alternatives: [{ componentType: 'textarea', confidence: 0.35 }] };
  }

  private toFieldKey(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'field';
  }
}

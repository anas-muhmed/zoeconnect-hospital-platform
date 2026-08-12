import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IAiClassifierProvider,
  ClassificationContext,
  KNOWN_COMPONENT_TYPES,
} from './ai-classifier-provider.interface';
import { LayoutElement, ClassifiedField } from '../entities/import-job.entity';
import { ISecretsProvider } from '../../../platform/infrastructure/secrets/secrets.interface';
import { SECRETS_PROVIDER } from '../../../platform/infrastructure/tokens';

/**
 * GeminiClassifierProvider — uses Google Gemini Pro to semantically classify
 * form fields extracted by the LayoutAnalyzer.
 *
 * The prompt instructs the model to output structured JSON mapping each
 * LayoutElement to:
 *  - componentType (from KNOWN_COMPONENT_TYPES)
 *  - confidence (0.0–1.0)
 *  - suggestedProps (label, placeholder, required, etc.)
 *  - alternativeSuggestions (if the model is unsure)
 *
 * Requires: GEMINI_API_KEY in environment.
 * Falls back to RuleBasedClassifierProvider if the API call fails.
 */
@Injectable()
export class GeminiClassifierProvider implements IAiClassifierProvider {
  readonly providerName = 'gemini-pro';
  private readonly logger = new Logger(GeminiClassifierProvider.name);

  constructor(
    @Inject(SECRETS_PROVIDER) private readonly secretsProvider: ISecretsProvider,
  ) {}

  async classify(
    elements: LayoutElement[],
    context?: ClassificationContext,
  ): Promise<ClassifiedField[]> {
    const apiKey = await this.secretsProvider.getSecret('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured — AI classification skipped, returning empty.');
      return [];
    }

    const prompt = this.buildPrompt(elements, context);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,       // low temperature for deterministic classification
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Gemini API error: ${response.status} — ${errorText}`);
        return [];
      }

      const raw = await response.json();
      const jsonText = raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
      const parsed = JSON.parse(jsonText);
      return this.mapToClassifiedFields(parsed, elements);
    } catch (err) {
      this.logger.error('Gemini classification failed', err);
      return [];
    }
  }

  private buildPrompt(elements: LayoutElement[], context?: ClassificationContext): string {
    const componentList = KNOWN_COMPONENT_TYPES.join(', ');
    const elementsSummary = elements
      .map((e, i) => `${i + 1}. [${e.kind}] "${e.text}" at (${e.boundingBox.x},${e.boundingBox.y}) size ${e.boundingBox.width}x${e.boundingBox.height}`)
      .join('\n');

    return `You are an expert hospital form analyst. You are analyzing a form extracted from a ${context?.specialty ?? 'clinical'} document.

Your task: classify each detected form element into the correct digital component type.

Available component types: ${componentList}

Classification rules:
- "name", "patient name", "full name" → textbox
- "date", "date of birth", "dob", "admission date" → textbox with props.inputType="date"
- "age" → textbox with props.inputType="number"
- "gender", "sex", "M/F" → radio
- "department", "ward", "designation", "blood group" → dropdown
- "diagnosis", "complaints", "history", "remarks", "notes", "observations" → textarea
- "doctor", "physician", "referred by" → textbox (could be a lookup)
- "signature", "sign", "authorized by" → signature
- Body silhouette, anatomical diagram references → body_diagram
- Tooth/dental grid → dental_chart
- Burn/Lund-Browder chart → burn_assessment
- Tables with repeated rows → table or repeat-section
- Checkbox groups, yes/no → checkbox (single) or radio (group)
- Numeric vitals (BP, HR, temperature, weight) → textbox with props.inputType="number"

For each element, return JSON with this structure:
{
  "elementIndex": <number>,
  "componentType": "<one of the available types>",
  "confidence": <0.0 to 1.0>,
  "fieldKey": "<snake_case_key>",
  "label": "<human readable label>",
  "suggestedProps": { <any props relevant to this component type> },
  "alternativeSuggestions": [
    { "componentType": "<type>", "confidence": <0.0 to 1.0> }
  ]
}

Return a JSON array of objects as above, one per element. Only include elements that represent form fields (skip pure title/header elements unless they define a field section).

Elements to classify:
${elementsSummary}

${context?.documentTitle ? `Document title: "${context.documentTitle}"` : ''}

Respond with ONLY the JSON array, no markdown, no explanation.`;
  }

  private mapToClassifiedFields(
    parsed: any[],
    elements: LayoutElement[],
  ): ClassifiedField[] {
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any) => {
        const el = elements[item.elementIndex - 1];
        if (!el) return null;

        const confidence = typeof item.confidence === 'number'
          ? Math.min(1, Math.max(0, item.confidence))
          : 0.5;

        const componentType = KNOWN_COMPONENT_TYPES.includes(item.componentType)
          ? item.componentType
          : 'textbox';

        return {
          id: `cf-${el.id}`,
          layoutElementId: el.id,
          pageIndex: el.pageIndex,
          label: item.label ?? el.text,
          fieldKey: item.fieldKey ?? this.toFieldKey(el.text),
          componentType,
          confidence,
          needsReview: confidence < 0.7,
          classifierSource: 'ai' as const,
          boundingBox: el.boundingBox,
          suggestedProps: item.suggestedProps ?? {},
          alternativeSuggestions: item.alternativeSuggestions ?? [],
        } satisfies ClassifiedField;
      })
      .filter(Boolean) as ClassifiedField[];
  }

  private toFieldKey(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'field';
  }
}

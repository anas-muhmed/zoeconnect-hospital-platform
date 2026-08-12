import { Injectable, Logger } from '@nestjs/common';
import {
  IAiClassifierProvider,
  ClassificationContext,
} from './ai-classifier-provider.interface';
import { LayoutElement, ClassifiedField } from '../entities/import-job.entity';
import { GeminiClassifierProvider } from './gemini-classifier.provider';
import { RuleBasedClassifierProvider } from './rule-based-classifier.provider';

/**
 * SemanticClassifier — orchestrates the AI-first, rule-fallback strategy.
 *
 * Execution order:
 *  1. Call Gemini (or configured AI provider). If it succeeds and returns
 *     results, use those — but for fields with confidence < 0.7, blend in
 *     the rule-based result if the rule-based confidence is higher.
 *  2. If Gemini fails entirely or returns empty, run the rule-based classifier
 *     on all elements.
 *  3. Deduplicate field keys and ensure every key is unique.
 */
@Injectable()
export class SemanticClassifier {
  private readonly logger = new Logger(SemanticClassifier.name);

  constructor(
    private readonly aiProvider: GeminiClassifierProvider,
    private readonly ruleProvider: RuleBasedClassifierProvider,
  ) {}

  async classify(
    elements: LayoutElement[],
    context?: ClassificationContext,
  ): Promise<{ fields: ClassifiedField[]; aiProviderUsed: string }> {
    let aiFields: ClassifiedField[] = [];
    let aiProviderUsed = 'none';

    // Step 1: Try AI provider
    try {
      aiFields = await this.aiProvider.classify(elements, context);
      if (aiFields.length > 0) {
        aiProviderUsed = this.aiProvider.providerName;
        this.logger.log(`AI classifier (${aiProviderUsed}) returned ${aiFields.length} fields`);
      }
    } catch (err) {
      this.logger.warn('AI classifier threw an error — falling back to rule-based', err);
    }

    // Step 2: Run rule-based on all elements regardless (used for fallback blending)
    let ruleFields: ClassifiedField[] = [];
    try {
      ruleFields = await this.ruleProvider.classify(elements, context);
    } catch (err) {
      this.logger.warn('Rule-based classifier failed', err);
    }

    // Step 3: If AI returned nothing, use rule-based entirely
    if (aiFields.length === 0) {
      this.logger.log(`Using rule-based classifier for ${ruleFields.length} fields`);
      return {
        fields: this.deduplicateKeys(ruleFields),
        aiProviderUsed: this.ruleProvider.providerName,
      };
    }

    // Step 4: Blend — for AI fields with confidence < 0.7, check if rule-based has a better match
    const blended = aiFields.map((aiField) => {
      if (aiField.confidence >= 0.7) return aiField;

      const ruleMatch = ruleFields.find((r) => r.layoutElementId === aiField.layoutElementId);
      if (ruleMatch && ruleMatch.confidence > aiField.confidence) {
        this.logger.debug(
          `Blending rule-based result for "${aiField.label}" — rule (${ruleMatch.confidence.toFixed(2)}) > ai (${aiField.confidence.toFixed(2)})`,
        );
        return {
          ...ruleMatch,
          // Keep AI's suggested props merged in, rule type takes precedence
          suggestedProps: { ...aiField.suggestedProps, ...ruleMatch.suggestedProps },
          classifierSource: 'rule' as const,
          alternativeSuggestions: [
            { componentType: aiField.componentType, confidence: aiField.confidence },
            ...(ruleMatch.alternativeSuggestions ?? []),
          ],
        };
      }
      return aiField;
    });

    // Step 5: Add rule-based fields for elements not covered by AI
    const aiCoveredIds = new Set(blended.map((f) => f.layoutElementId));
    const extraRuleFields = ruleFields.filter((r) => !aiCoveredIds.has(r.layoutElementId));
    const allFields = [...blended, ...extraRuleFields];

    return {
      fields: this.deduplicateKeys(allFields),
      aiProviderUsed,
    };
  }

  private deduplicateKeys(fields: ClassifiedField[]): ClassifiedField[] {
    const seen = new Map<string, number>();
    return fields.map((f) => {
      const base = f.fieldKey;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? f : { ...f, fieldKey: `${base}_${count}` };
    });
  }
}

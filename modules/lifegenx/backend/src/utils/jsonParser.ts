import { logger } from '../config/logger';

export function parseLLMJsonResponse<T>(rawText: string, fallback: T): T {
  if (!rawText) return fallback;

  try {
    // Clean up potential markdown formatting code blocks
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Locate the first { or [ and last } or ]
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleaned) as T;
  } catch (error) {
    logger.warn({ error, rawText }, 'Failed to parse JSON from LLM response, returning fallback');
    return fallback;
  }
}

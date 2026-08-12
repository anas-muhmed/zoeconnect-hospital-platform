/** LifeGenX integration. Pure port of `prompts/symptomExtraction.ts` + `prompts/diagnosisPrompt.ts`. */

export function buildSymptomExtractionPrompt(transcribedText: string): string {
  return `Transcript of doctor-patient interaction:

${transcribedText}

Extract:

1. Key symptoms reported
(skip denied or irrelevant symptoms)

2. Observations

Include
• Medical history
• Existing diseases
• Lifestyle
• Smoking
• Alcohol
• Medications
• Allergies
• Age
• Pregnancy if mentioned
• Family history
• Denied symptoms

Format exactly

Symptoms:
- Symptom 1
- Symptom 2

Observations:
- Observation 1
- Observation 2

Return JSON
{
   "symptoms": [
      "Symptom 1",
      "Symptom 2"
   ],
   "observations": [
      "Observation 1",
      "Observation 2"
   ]
}`;
}

export function buildDiagnosisPrompt(symptoms: string[], observations: string[]): string {
  const formattedSymptoms = symptoms.map((s) => `- ${s}`).join('\n');
  const formattedObservations = observations.length > 0
    ? observations.map((o) => `- ${o}`).join('\n')
    : 'None reported';

  return `A patient has the following symptoms:

${formattedSymptoms}

Other observations:

${formattedObservations}

List the top 3 possible diagnoses based on these symptoms and observations.

For each diagnosis also list the most relevant medical tests to confirm or rule out the condition.

Respond ONLY as valid JSON using this schema:

{
  "diagnoses": [
    {
      "name": "",
      "confidence": "",
      "recommendedTests": []
    }
  ]
}`;
}

/** Pure port of `utils/jsonParser.ts::parseLLMJsonResponse`. */
export function parseLLMJsonResponse<T>(rawText: string, fallback: T): T {
  if (!rawText) return fallback;
  try {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const firstBrace = cleaned.search(/[{[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

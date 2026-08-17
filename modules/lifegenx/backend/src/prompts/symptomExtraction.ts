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

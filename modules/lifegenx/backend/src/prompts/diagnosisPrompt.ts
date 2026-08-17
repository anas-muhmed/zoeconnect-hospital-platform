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

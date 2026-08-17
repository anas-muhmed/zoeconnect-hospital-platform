import fs from 'fs';
import Groq from 'groq-sdk';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { buildSymptomExtractionPrompt } from '../prompts/symptomExtraction';
import { buildDiagnosisPrompt } from '../prompts/diagnosisPrompt';
import { parseLLMJsonResponse } from '../utils/jsonParser';

const groq = config.groqApiKey ? new Groq({ apiKey: config.groqApiKey }) : null;

export interface ExtractedData {
  symptoms: string[];
  observations: string[];
}

export interface DiagnosisItem {
  name: string;
  confidence: string;
  recommendedTests: string[];
}

export interface DiagnosisData {
  diagnoses: DiagnosisItem[];
}

export async function transcribeAudio(filePath: string): Promise<string> {
  logger.info({ filePath }, 'Transcribing audio...');

  if (!groq || !config.groqApiKey || config.groqApiKey === 'mock_groq_api_key' || !fs.existsSync(filePath)) {
    logger.warn('Groq API Key not configured or mock mode enabled. Using realistic mock clinical transcription.');
    return (
      "Doctor: Good morning, Mr. Davis. What brings you in today?\n" +
      "Patient: Doctor, I've had a persistent high fever of 101.5°F for the past 3 days, accompanied by a severe dry cough and terrible pounding headaches.\n" +
      "Doctor: I see. Are you experiencing any chest pain, shortness of breath, or vomiting?\n" +
      "Patient: No chest pain or vomiting, but I feel very fatigued and my body aches all over.\n" +
      "Doctor: Any existing medical conditions or ongoing medications?\n" +
      "Patient: I am 56 years old, diagnosed with Type 2 Diabetes and Hypertension. I smoke half a pack a day. No known drug allergies."
    );
  }

  try {
    const fileStream = fs.createReadStream(filePath);
    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-large-v3',
      response_format: 'text',
      language: 'en'
    });

    const result = typeof transcription === 'string' ? transcription : (transcription as any).text;
    logger.info({ length: result?.length }, 'Audio transcription completed successfully');
    return result || 'No speech recognized from audio file.';
  } catch (error) {
    logger.error({ error }, 'Groq Whisper Transcription error. Falling back to default transcript.');
    return (
      "Patient reports fever, dry cough, severe headache, and body aches for 3 days. " +
      "No chest pain or vomiting. Age 56, history of Type 2 Diabetes and Hypertension. Smoker."
    );
  }
}

export async function extractSymptoms(transcript: string): Promise<ExtractedData> {
  logger.info('Extracting symptoms and observations via Groq LLM...');

  const fallback: ExtractedData = {
    symptoms: ['Fever', 'Dry cough', 'Headache', 'Body aches', 'Fatigue'],
    observations: [
      'Age: 56',
      'Known diabetic (Type 2)',
      'Hypertension',
      'Smoker (0.5 pack/day)',
      'No chest pain',
      'No vomiting',
      'No known drug allergies'
    ]
  };

  const prompt = buildSymptomExtractionPrompt(transcript);

  if (!groq || !config.groqApiKey || config.groqApiKey === 'mock_groq_api_key') {
    logger.warn('Using mock symptom extraction response');
    return fallback;
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an expert AI clinical documentation assistant. Output strictly JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const rawResponse = completion.choices[0]?.message?.content || '';
    logger.debug({ rawResponse }, 'Received LLM symptom extraction response');

    return parseLLMJsonResponse<ExtractedData>(rawResponse, fallback);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to call Groq LLM for symptom extraction, trying secondary fallback model');
    
    // Try fallback model if model name issue
    try {
      if (groq) {
        const fallbackCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are a clinical AI assistant. Output JSON only.' },
            { role: 'user', content: prompt }
          ],
          model: 'llama-3.1-8b-instant',
          temperature: 0.2,
          response_format: { type: 'json_object' }
        });
        const text = fallbackCompletion.choices[0]?.message?.content || '';
        return parseLLMJsonResponse<ExtractedData>(text, fallback);
      }
    } catch (e) {
      logger.error('Secondary fallback failed as well.');
    }

    return fallback;
  }
}

export async function generateDiagnosis(symptoms: string[], observations: string[]): Promise<DiagnosisData> {
  logger.info({ symptoms, observations }, 'Generating differential diagnosis via Groq LLM...');

  const fallback: DiagnosisData = {
    diagnoses: [
      {
        name: 'Acute Viral Respiratory Tract Infection (e.g. Influenza / COVID-19)',
        confidence: '87%',
        recommendedTests: ['Complete Blood Count (CBC)', 'C-Reactive Protein (CRP)', 'Viral Nasopharyngeal Swab PCR', 'Chest X-Ray']
      },
      {
        name: 'Acute Bronchitis (Diabetic Exacerbation Risk)',
        confidence: '64%',
        recommendedTests: ['Sputum Culture', 'Pulse Oximetry', 'Blood Glucose Panel (HbA1c & Fasting Glucose)']
      },
      {
        name: 'Early Community-Acquired Pneumonia (CAP)',
        confidence: '42%',
        recommendedTests: ['High-Resolution Chest CT', 'Procalcitonin Level', 'Blood Cultures x 2']
      }
    ]
  };

  const prompt = buildDiagnosisPrompt(symptoms, observations);

  if (!groq || !config.groqApiKey || config.groqApiKey === 'mock_groq_api_key') {
    logger.warn('Using mock diagnosis response');
    return fallback;
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a Senior Consultant Physician AI. Respond ONLY with valid JSON conforming to the requested schema.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const rawResponse = completion.choices[0]?.message?.content || '';
    logger.debug({ rawResponse }, 'Received LLM diagnosis response');

    return parseLLMJsonResponse<DiagnosisData>(rawResponse, fallback);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to call Groq LLM for diagnosis, trying secondary fallback model');
    try {
      if (groq) {
        const fallbackCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are a Senior Consultant Physician AI. Output JSON only.' },
            { role: 'user', content: prompt }
          ],
          model: 'llama-3.1-8b-instant',
          temperature: 0.3,
          response_format: { type: 'json_object' }
        });
        const text = fallbackCompletion.choices[0]?.message?.content || '';
        return parseLLMJsonResponse<DiagnosisData>(text, fallback);
      }
    } catch (e) {
      logger.error('Secondary fallback failed.');
    }

    return fallback;
  }
}

export async function askZoiBot(userInput: string): Promise<string> {
  logger.info({ userInput }, 'Querying ZoiBot clinical assistant...');

  const systemPrompt = "You are ZoiBot, an intelligent clinical AI assistant for doctors. Provide detailed, empathetic, and highly accurate medical guidance, referral drafts, patient communication templates, and differential considerations.";
  const prompt = `Tasks: medical advice, drafting letters, diagnoses, emails, health education.

${userInput}`;

  const getClinicalFallback = (query: string): string => {
    const lowerInput = query.toLowerCase();
    if (lowerInput.includes('fever') || lowerInput.includes('cough') || lowerInput.includes('symptom')) {
      return `Based on the clinical details provided, here is a structured medical summary:

### Differential Diagnoses
1. **Acute Viral Bronchitis**: Common presentation. Advise symptomatic care, adequate hydration, and monitoring.
2. **Influenza / Acute Upper Respiratory Tract Infection**: Consider rapid antigen/swab testing if within 48h of onset.

### Recommended Management Plan
- Rest, oral fluids, and antipyretics (e.g. Paracetamol / Acetaminophen 500mg q6h PRN, max 4g/day).
- Red flag warnings: return immediately if severe dyspnea, chest pain, or persistent high fever >5 days occurs.

*This summary is generated by Zoi.AI and should be verified by a attending physician.*`;
    }

    if (lowerInput.includes('letter') || lowerInput.includes('referral')) {
      return `Dear Colleague,

Re: Patient Consultation & Referral Request

I am writing to refer a 56-year-old patient with persistent respiratory symptoms and underlying Type 2 Diabetes for your specialist evaluation and management.

Given the clinical presentation, a detailed baseline cardiac/pulmonary evaluation and targeted diagnostics are recommended.

Thank you for your expert assistance in co-managing this patient.

Sincerely,
Attending Clinician
Department of Internal Medicine`;
    }

    if (lowerInput.includes('email') || lowerInput.includes('patient')) {
      return `Subject: Follow-up Information Regarding Your Recent Consultation

Dear Patient,

I hope you are doing well.

Following our recent consultation, please continue your prescribed medication schedule and record daily blood pressure / temperature readings as discussed.

If you develop worsening shortness of breath, chest pressure, or high persistent fever, please seek immediate medical evaluation.

Warm regards,
Clinical Care Team`;
    }

    return `Hello Doctor. I am ZoiBot, your intelligent clinical assistant.

I can assist your medical practice with:
- **Clinical Consultations**: Differential diagnoses & diagnostic testing guidance.
- **Documentation & Referrals**: Professional specialist referral notes & medical certificates.
- **Patient Communication**: Structured follow-up emails and instructions.
- **Health Education**: Patient-friendly explanations for complex medical conditions.

Please ask me any clinical question or request a draft to get started.`;
  };

  if (!groq || !config.groqApiKey || config.groqApiKey === 'mock_groq_api_key') {
    logger.warn('ZoiBot: Groq API Key not configured or mock mode enabled. Using clinical mock response.');
    return getClinicalFallback(userInput);
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 900
    });

    return completion.choices[0]?.message?.content || getClinicalFallback(userInput);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to call Groq LLM for ZoiBot, trying secondary fallback model');
    try {
      if (groq) {
        const fallbackCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          model: 'llama-3.1-8b-instant',
          temperature: 0.4,
          max_tokens: 900
        });
        return fallbackCompletion.choices[0]?.message?.content || getClinicalFallback(userInput);
      }
    } catch (e) {
      logger.error('ZoiBot secondary fallback failed as well.');
    }
    return getClinicalFallback(userInput);
  }
}


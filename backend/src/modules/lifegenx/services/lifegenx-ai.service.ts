import * as fs from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { buildSymptomExtractionPrompt, buildDiagnosisPrompt, parseLLMJsonResponse } from '../lifegenx-prompts.util';

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

export interface MalayalamFlowResult {
  malayalamTranscript: string;
  englishTranslation: string;
}

/**
 * LifeGenX integration (delivery phase). Ports `services/groq.service.ts`
 * + `services/gemini.service.ts` — Whisper transcription, LLM symptom
 * extraction/diagnosis/ZoiBot chat (Groq), and Malayalam audio
 * transcription+translation (Gemini).
 *
 * Deliberately calls the Groq/Gemini SDKs directly rather than routing
 * through ZoeConnect's platform-wide AI governance framework
 * (`platform/services/ai-platform` — provider registry, cost tracking,
 * clinical-safety engine, evaluation framework, etc.). That framework has
 * no Groq adapter today and integrating with its governance pipeline is a
 * substantial scope expansion with no evidenced requirement here — same
 * "use the lighter, purpose-fit existing seam" call CliniGrowth made by
 * using `OraclePoolManager` directly instead of the full `IOracleTransport`/
 * query-template system. A future pass MAY wire this into the AI platform;
 * out of scope for this delivery.
 *
 * All fallback/mock responses (mirroring the source's own graceful-
 * degradation-without-a-configured-API-key behavior) are preserved
 * verbatim — real behavior the module relies on for demo/offline use, not
 * dead code.
 */
@Injectable()
export class LifeGenXAiService {
  private readonly logger = new Logger(LifeGenXAiService.name);
  private readonly groq: Groq | null;
  private readonly groqApiKey: string;
  private readonly gemini: GoogleGenAI | null;

  constructor(private readonly configService: ConfigService) {
    this.groqApiKey = this.configService.get<string>('LIFEGENX_GROQ_API_KEY', '');
    this.groq = this.groqApiKey ? new Groq({ apiKey: this.groqApiKey }) : null;

    const geminiApiKey = this.configService.get<string>('LIFEGENX_GEMINI_API_KEY', '');
    this.gemini = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
  }

  async transcribeAudio(filePath: string): Promise<string> {
    if (!this.groq || !this.groqApiKey || !fs.existsSync(filePath)) {
      this.logger.warn('Groq API key not configured or audio file missing — using mock clinical transcription.');
      return (
        'Doctor: Good morning, Mr. Davis. What brings you in today?\n' +
        "Patient: Doctor, I've had a persistent high fever of 101.5°F for the past 3 days, accompanied by a severe dry cough and terrible pounding headaches.\n" +
        'Doctor: I see. Are you experiencing any chest pain, shortness of breath, or vomiting?\n' +
        'Patient: No chest pain or vomiting, but I feel very fatigued and my body aches all over.\n' +
        'Doctor: Any existing medical conditions or ongoing medications?\n' +
        'Patient: I am 56 years old, diagnosed with Type 2 Diabetes and Hypertension. I smoke half a pack a day. No known drug allergies.'
      );
    }

    try {
      const fileStream = fs.createReadStream(filePath);
      const transcription = await this.groq.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-large-v3',
        response_format: 'text',
        language: 'en',
      });
      const result = typeof transcription === 'string' ? transcription : (transcription as unknown as { text?: string }).text;
      return result || 'No speech recognized from audio file.';
    } catch (error) {
      this.logger.error(`Groq Whisper transcription error, falling back: ${(error as Error).message}`);
      return (
        'Patient reports fever, dry cough, severe headache, and body aches for 3 days. ' +
        'No chest pain or vomiting. Age 56, history of Type 2 Diabetes and Hypertension. Smoker.'
      );
    }
  }

  async transcribeAndTranslateMalayalam(filePath: string): Promise<MalayalamFlowResult> {
    if (!this.gemini) {
      throw new Error('Gemini API client not initialized — LIFEGENX_GEMINI_API_KEY is missing.');
    }
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Audio file not found at path: "${filePath}"`);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    const ext = filePath.split('.').pop()?.toLowerCase();
    let mimeType = 'audio/webm';
    if (ext === 'mp3') mimeType = 'audio/mp3';
    else if (ext === 'wav') mimeType = 'audio/wav';
    else if (ext === 'm4a') mimeType = 'audio/m4a';
    else if (ext === 'ogg') mimeType = 'audio/ogg';

    const prompt =
      'The attached audio is a consultation conversation between a patient and a doctor. It contains English, ' +
      'Manglish (Malayalam written in English letters), and colloquial Malayalam. ' +
      'Please transcribe this dialogue exactly as spoken, and translate the complete conversation to clean clinical English. ' +
      "Return your response ONLY in a valid JSON format with two keys: 'malayalamTranscript' (representing the original Malayalam/Manglish/mixed transcription) " +
      "and 'englishTranslation' (representing the translated English transcript).";

    // Source specified 'gemini-3.6-flash', not a published Gemini model ID
    // (this call has no fallback path -- it throws on failure, unlike every
    // Groq call above) -- using a real current model name instead of a
    // string that would always fail.
    const response = await this.gemini.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        prompt,
      ],
      config: { responseMimeType: 'application/json' },
    });

    const responseText = response.text || '';
    try {
      const parsed = JSON.parse(responseText);
      if (parsed.malayalamTranscript && parsed.englishTranslation) {
        return { malayalamTranscript: parsed.malayalamTranscript, englishTranslation: parsed.englishTranslation };
      }
    } catch {
      const malMatch = responseText.match(/"malayalamTranscript"\s*:\s*"([^"]+)"/);
      const engMatch = responseText.match(/"englishTranslation"\s*:\s*"([^"]+)"/);
      if (malMatch && engMatch) {
        return {
          malayalamTranscript: malMatch[1].replace(/\\n/g, '\n'),
          englishTranslation: engMatch[1].replace(/\\n/g, '\n'),
        };
      }
      throw new Error(`Failed to parse bilingual JSON response from Gemini. Raw text: ${responseText}`);
    }
    throw new Error('Missing keys in JSON response from Gemini');
  }

  async extractSymptoms(transcript: string): Promise<ExtractedData> {
    const fallback: ExtractedData = {
      symptoms: ['Fever', 'Dry cough', 'Headache', 'Body aches', 'Fatigue'],
      observations: [
        'Age: 56', 'Known diabetic (Type 2)', 'Hypertension', 'Smoker (0.5 pack/day)',
        'No chest pain', 'No vomiting', 'No known drug allergies',
      ],
    };
    if (!this.groq || !this.groqApiKey) return fallback;

    const prompt = buildSymptomExtractionPrompt(transcript);
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an expert AI clinical documentation assistant. Output strictly JSON.' },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      const rawResponse = completion.choices[0]?.message?.content || '';
      return parseLLMJsonResponse<ExtractedData>(rawResponse, fallback);
    } catch (error) {
      this.logger.warn(`Groq symptom extraction failed, trying fallback model: ${(error as Error).message}`);
      try {
        const fallbackCompletion = await this.groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are a clinical AI assistant. Output JSON only.' },
            { role: 'user', content: prompt },
          ],
          model: 'llama-3.1-8b-instant',
          temperature: 0.2,
          response_format: { type: 'json_object' },
        });
        return parseLLMJsonResponse<ExtractedData>(fallbackCompletion.choices[0]?.message?.content || '', fallback);
      } catch {
        return fallback;
      }
    }
  }

  async generateDiagnosis(symptoms: string[], observations: string[]): Promise<DiagnosisData> {
    const fallback: DiagnosisData = {
      diagnoses: [
        {
          name: 'Acute Viral Respiratory Tract Infection (e.g. Influenza / COVID-19)',
          confidence: '87%',
          recommendedTests: ['Complete Blood Count (CBC)', 'C-Reactive Protein (CRP)', 'Viral Nasopharyngeal Swab PCR', 'Chest X-Ray'],
        },
        {
          name: 'Acute Bronchitis (Diabetic Exacerbation Risk)',
          confidence: '64%',
          recommendedTests: ['Sputum Culture', 'Pulse Oximetry', 'Blood Glucose Panel (HbA1c & Fasting Glucose)'],
        },
        {
          name: 'Early Community-Acquired Pneumonia (CAP)',
          confidence: '42%',
          recommendedTests: ['High-Resolution Chest CT', 'Procalcitonin Level', 'Blood Cultures x 2'],
        },
      ],
    };
    if (!this.groq || !this.groqApiKey) return fallback;

    const prompt = buildDiagnosisPrompt(symptoms, observations);
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a Senior Consultant Physician AI. Respond ONLY with valid JSON conforming to the requested schema.' },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });
      return parseLLMJsonResponse<DiagnosisData>(completion.choices[0]?.message?.content || '', fallback);
    } catch (error) {
      this.logger.warn(`Groq diagnosis failed, trying fallback model: ${(error as Error).message}`);
      try {
        const fallbackCompletion = await this.groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are a Senior Consultant Physician AI. Output JSON only.' },
            { role: 'user', content: prompt },
          ],
          model: 'llama-3.1-8b-instant',
          temperature: 0.3,
          response_format: { type: 'json_object' },
        });
        return parseLLMJsonResponse<DiagnosisData>(fallbackCompletion.choices[0]?.message?.content || '', fallback);
      } catch {
        return fallback;
      }
    }
  }

  async askZoiBot(userInput: string): Promise<string> {
    const systemPrompt = 'You are ZoiBot, an intelligent clinical AI assistant for doctors. Provide detailed, empathetic, and highly accurate medical guidance, referral drafts, patient communication templates, and differential considerations.';
    const prompt = `Tasks: medical advice, drafting letters, diagnoses, emails, health education.\n\n${userInput}`;

    const getClinicalFallback = (query: string): string => {
      const lowerInput = query.toLowerCase();
      if (lowerInput.includes('fever') || lowerInput.includes('cough') || lowerInput.includes('symptom')) {
        return 'Based on the clinical details provided, here is a structured medical summary:\n\n### Differential Diagnoses\n1. **Acute Viral Bronchitis**: Common presentation. Advise symptomatic care, adequate hydration, and monitoring.\n2. **Influenza / Acute Upper Respiratory Tract Infection**: Consider rapid antigen/swab testing if within 48h of onset.\n\n### Recommended Management Plan\n- Rest, oral fluids, and antipyretics (e.g. Paracetamol / Acetaminophen 500mg q6h PRN, max 4g/day).\n- Red flag warnings: return immediately if severe dyspnea, chest pain, or persistent high fever >5 days occurs.\n\n*This summary is generated by Zoi.AI and should be verified by a attending physician.*';
      }
      if (lowerInput.includes('letter') || lowerInput.includes('referral')) {
        return 'Dear Colleague,\n\nRe: Patient Consultation & Referral Request\n\nI am writing to refer a 56-year-old patient with persistent respiratory symptoms and underlying Type 2 Diabetes for your specialist evaluation and management.\n\nGiven the clinical presentation, a detailed baseline cardiac/pulmonary evaluation and targeted diagnostics are recommended.\n\nThank you for your expert assistance in co-managing this patient.\n\nSincerely,\nAttending Clinician\nDepartment of Internal Medicine';
      }
      if (lowerInput.includes('email') || lowerInput.includes('patient')) {
        return 'Subject: Follow-up Information Regarding Your Recent Consultation\n\nDear Patient,\n\nI hope you are doing well.\n\nFollowing our recent consultation, please continue your prescribed medication schedule and record daily blood pressure / temperature readings as discussed.\n\nIf you develop worsening shortness of breath, chest pressure, or high persistent fever, please seek immediate medical evaluation.\n\nWarm regards,\nClinical Care Team';
      }
      return 'Hello Doctor. I am ZoiBot, your intelligent clinical assistant.\n\nI can assist your medical practice with:\n- **Clinical Consultations**: Differential diagnoses & diagnostic testing guidance.\n- **Documentation & Referrals**: Professional specialist referral notes & medical certificates.\n- **Patient Communication**: Structured follow-up emails and instructions.\n- **Health Education**: Patient-friendly explanations for complex medical conditions.\n\nPlease ask me any clinical question or request a draft to get started.';
    };

    if (!this.groq || !this.groqApiKey) return getClinicalFallback(userInput);

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 900,
      });
      return completion.choices[0]?.message?.content || getClinicalFallback(userInput);
    } catch (error) {
      this.logger.warn(`Groq ZoiBot failed, trying fallback model: ${(error as Error).message}`);
      try {
        const fallbackCompletion = await this.groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          model: 'llama-3.1-8b-instant',
          temperature: 0.4,
          max_tokens: 900,
        });
        return fallbackCompletion.choices[0]?.message?.content || getClinicalFallback(userInput);
      } catch {
        return getClinicalFallback(userInput);
      }
    }
  }
}

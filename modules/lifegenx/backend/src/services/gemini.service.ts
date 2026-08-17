import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env';
import { logger } from '../config/logger';

// Initialize GenAI client. It will automatically capture GEMINI_API_KEY from environment or our config key.
const geminiApiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
const ai = geminiApiKey && geminiApiKey !== 'mock_gemini_api_key' ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export interface MalayalamFlowResult {
  malayalamTranscript: string;
  englishTranslation: string;
}

export async function transcribeAndTranslateMalayalam(filePath: string): Promise<MalayalamFlowResult> {
  logger.info({ filePath }, 'Transcribing and translating Malayalam audio via Gemini...');

  if (!ai) {
    throw new Error('Gemini API client not initialized. GEMINI_API_KEY is missing in backend env.');
  }

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Audio file not found at path: "${filePath}"`);
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    // Get file extension to map standard mime types
    const ext = filePath.split('.').pop()?.toLowerCase();
    let mimeType = 'audio/webm';
    if (ext === 'mp3') mimeType = 'audio/mp3';
    else if (ext === 'wav') mimeType = 'audio/wav';
    else if (ext === 'm4a') mimeType = 'audio/m4a';
    else if (ext === 'ogg') mimeType = 'audio/ogg';

    const prompt =
      "The attached audio is a consultation conversation between a patient and a doctor. It contains English, " +
      "Manglish (Malayalam written in English letters), and colloquial Malayalam. " +
      "Please transcribe this dialogue exactly as spoken, and translate the complete conversation to clean clinical English. " +
      "Return your response ONLY in a valid JSON format with two keys: 'malayalamTranscript' (representing the original Malayalam/Manglish/mixed transcription) " +
      "and 'englishTranslation' (representing the translated English transcript).";

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        prompt
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || '';
    logger.debug({ responseText }, 'Received Gemini API response');

    try {
      const parsed = JSON.parse(responseText);
      if (parsed.malayalamTranscript && parsed.englishTranslation) {
        return {
          malayalamTranscript: parsed.malayalamTranscript,
          englishTranslation: parsed.englishTranslation
        };
      }
    } catch (parseErr) {
      logger.error({ responseText }, 'Failed to parse JSON response from Gemini, seeking manual regex extraction');

      const malMatch = responseText.match(/"malayalamTranscript"\s*:\s*"([^"]+)"/);
      const engMatch = responseText.match(/"englishTranslation"\s*:\s*"([^"]+)"/);
      if (malMatch && engMatch) {
        return {
          malayalamTranscript: malMatch[1].replace(/\\n/g, '\n'),
          englishTranslation: engMatch[1].replace(/\\n/g, '\n')
        };
      }
      throw new Error(`Failed to parse bilingual JSON response from Gemini. Raw text: ${responseText}`);
    }

    throw new Error('Missing keys in JSON response from Gemini');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to transcribe/translate audio via Gemini');
    throw error;
  }
}

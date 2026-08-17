import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env';
import { transcribeSchema, extractSymptomsSchema, diagnosisSchema, zoiBotSchema } from '../validators/ai.validator';
import { transcribeAudio, extractSymptoms, generateDiagnosis, askZoiBot } from '../services/groq.service';
import { transcribeAndTranslateMalayalam } from '../services/gemini.service';
import { sendSuccess, sendError } from '../utils/responseHandler';

export async function handleTranscribeAudio(req: Request, res: Response, next: NextFunction) {
  try {
    const { audioId, language } = transcribeSchema.parse(req.body);

    let filePath = '';
    // Look for matching file in upload dir
    if (fs.existsSync(config.uploadDir)) {
      const files = fs.readdirSync(config.uploadDir);
      const match = files.find((f) => f.includes(audioId));
      if (match) {
        filePath = path.join(config.uploadDir, match);
      }
    }

    if (language === 'malayalam') {
      const result = await transcribeAndTranslateMalayalam(filePath);
      return sendSuccess(
        res,
        {
          malayalamTranscript: result.malayalamTranscript,
          transcript: result.englishTranslation // English translation mapped to default transcript for symptoms extraction
        },
        'Malayalam transcription and translation completed via Gemini'
      );
    }

    const transcript = await transcribeAudio(filePath);
    return sendSuccess(res, { transcript }, 'Audio transcription completed');
  } catch (error) {
    next(error);
  }
}

export async function handleExtractSymptoms(req: Request, res: Response, next: NextFunction) {
  try {
    const { transcript } = extractSymptomsSchema.parse(req.body);
    const extractedData = await extractSymptoms(transcript);
    return sendSuccess(res, extractedData, 'Symptom extraction completed');
  } catch (error) {
    next(error);
  }
}

export async function handleGenerateDiagnosis(req: Request, res: Response, next: NextFunction) {
  try {
    const { symptoms, observations } = diagnosisSchema.parse(req.body);
    const result = await generateDiagnosis(symptoms, observations || []);
    return sendSuccess(res, result, 'Differential diagnosis generated');
  } catch (error) {
    next(error);
  }
}

export async function handleZoiBot(req: Request, res: Response, next: NextFunction) {
  try {
    const { userInput } = zoiBotSchema.parse(req.body);
    const result = await askZoiBot(userInput);
    return sendSuccess(res, { response: result }, 'ZoiBot query processed successfully');
  } catch (error) {
    next(error);
  }
}

import { AiCapabilityType } from '../../interfaces/ai-capability.interface';

export class EvaluationDatasetEntity {
  id: string; // e.g. 'ocr-dataset-v1'
  name: string; // e.g. 'OCR Dataset'
  capability: AiCapabilityType;
  description: string;
  version: string;
  records: EvaluationDatasetRecordEntity[];
}

export class EvaluationDatasetRecordEntity {
  id: string;
  inputPayload: any; // Prompt or Document
  expectedOutput: any; // Expected JSON or Text
  evaluationCriteria: string[]; // e.g. ['Contains patient name', 'JSON structure matches schema']
}

import { OcrPage } from '../entities/import-job.entity';

/**
 * IOcrProvider — abstraction over OCR engines.
 * Implementations: TesseractOcrProvider (default), or future cloud providers.
 */
export interface IOcrProvider {
  /**
   * Extracts text and bounding boxes from a document buffer.
   * @param buffer  Raw file bytes (PDF or image).
   * @param mimeType e.g. 'application/pdf', 'image/png', 'image/jpeg'
   * @returns Array of pages, each with words + bounding boxes.
   */
  extractText(buffer: Buffer, mimeType: string): Promise<OcrPage[]>;

  /** Human-readable provider name for logging/audit. */
  readonly providerName: string;
}

export const IOcrProvider = 'IOcrProvider';

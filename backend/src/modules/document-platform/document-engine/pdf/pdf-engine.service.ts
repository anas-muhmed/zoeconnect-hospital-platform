import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { DocumentTypeRegistryService } from '../document-type-registry/document-type-registry.service';

/**
 * PdfEngineService — the generic Document Platform PDF generator (ADR-002,
 * Phase 4A §2.1). Dispatches PDF rendering to the `pdfRenderer` callback
 * registered on each `DocumentTypeDefinition`. This service knows nothing
 * about forms specifically; it only knows that a document type may declare
 * a renderer and that it receives a payload + answers and returns a Buffer.
 *
 * Milestone 4 scope: the 'form' document type registers a Wave-1-capable
 * renderer via FormsDesignerModule.onModuleInit(). The PdfEngineService
 * calls that callback. Future document types (Consent, Certificates) will
 * register their own callbacks without touching this service (ADR-002's
 * "additive registrations, not redesigns" principle).
 *
 * ADR-013 performance target: <5s for a 10-page submission. Not enforced
 * in CI until Milestone 7's formal performance test suite; the current
 * Wave-1-only implementation comfortably meets this target for simple forms.
 */
@Injectable()
export class PdfEngineService {
  private readonly logger = new Logger(PdfEngineService.name);

  constructor(private readonly typeRegistry: DocumentTypeRegistryService) {}

  /**
   * Generates a PDF for a finalized document instance.
   *
   * @param documentTypeId - The registered document type (e.g. 'form')
   * @param payload        - The document version's payload (e.g. FormSchema JSON)
   * @param answers        - The instance's filled answers (may be empty for template-only PDFs)
   * @returns              - A PDF Buffer, ready for HTTP response or storage
   * @throws NotImplementedException if the document type has no pdfRenderer registered
   */
  async generatePdf(
    documentTypeId: string,
    payload: unknown,
    answers: Record<string, unknown>,
  ): Promise<Buffer> {
    const definition = this.typeRegistry.get(documentTypeId);
    if (!definition) {
      throw new NotImplementedException(
        `PdfEngineService: no document type registered for id "${documentTypeId}".`,
      );
    }
    if (!definition.pdfRenderer) {
      throw new NotImplementedException(
        `PdfEngineService: document type "${documentTypeId}" does not declare a pdfRenderer. ` +
          `Register one in its DocumentTypeDefinition to enable PDF generation (ADR-002).`,
      );
    }

    this.logger.log(`Generating PDF for document type "${documentTypeId}"`);
    const buffer = await definition.pdfRenderer(payload, answers);
    this.logger.log(
      `PDF generated for document type "${documentTypeId}" — ${buffer.byteLength} bytes`,
    );
    return buffer;
  }
}

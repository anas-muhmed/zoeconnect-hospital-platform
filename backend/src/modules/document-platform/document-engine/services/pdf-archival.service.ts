import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PdfEngineService } from '../pdf/pdf-engine.service';
import { DocumentInstanceService } from './document-instance.service';
import { DocumentService } from './document.service';

/**
 * Service responsible for archiving finalized PDF instances into immutable storage.
 */
@Injectable()
export class PdfArchivalService {
  private readonly logger = new Logger(PdfArchivalService.name);

  constructor(
    private readonly pdfEngineService: PdfEngineService,
    private readonly documentService: DocumentService,
    private readonly instanceService: DocumentInstanceService,
  ) {}

  async archiveInstance(instanceId: string): Promise<string> {
    const instance = await this.instanceService.getInstance(instanceId);
    
    // Only completed (or archived/locked) documents should be sent to the external archival system.
    if (instance.status !== 'completed' && instance.status !== 'archived' && instance.status !== 'locked') {
      throw new BadRequestException(`Cannot archive instance ${instanceId}. Status is ${instance.status}, must be completed/locked/archived.`);
    }

    const version = await this.documentService.getVersionById(instance.documentVersionId);
    const pdfBuffer = await this.pdfEngineService.generatePdf('form', version.payload, instance.answers);

    // Mock static bucket upload
    const bucketPath = `s3://hdsp-archives/instances/${instanceId}/document.pdf`;
    
    this.logger.log(`Archiving PDF (${pdfBuffer.byteLength} bytes) to ${bucketPath} as immutable legal record.`);

    // In a real implementation, we would write `pdfBuffer` to S3 or equivalent.
    // For now, we simulate the upload success.
    await new Promise((resolve) => setTimeout(resolve, 200));

    return bucketPath;
  }
}

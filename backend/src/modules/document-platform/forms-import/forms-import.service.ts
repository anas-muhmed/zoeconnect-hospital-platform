import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportJobEntity, ImportJobStatus, ClassifiedField } from './entities/import-job.entity';
import { TesseractOcrProvider } from './ocr/tesseract-ocr.provider';
import { LayoutAnalyzer } from './layout/layout-analyzer';
import { SemanticClassifier } from './classifier/semantic-classifier';
import { SchemaGenerator } from './schema-gen/schema-generator';
import { SuggestionEngine } from './suggestions/suggestion-engine';
import { DocumentService } from '../document-engine/services/document.service';

@Injectable()
export class FormsImportService {
  private readonly logger = new Logger(FormsImportService.name);

  constructor(
    @InjectRepository(ImportJobEntity)
    private readonly jobRepo: Repository<ImportJobEntity>,
    private readonly ocrProvider: TesseractOcrProvider,
    private readonly layoutAnalyzer: LayoutAnalyzer,
    private readonly semanticClassifier: SemanticClassifier,
    private readonly schemaGenerator: SchemaGenerator,
    private readonly suggestionEngine: SuggestionEngine,
    private readonly documentService: DocumentService,
  ) {}

  /** Step 0: Accept an uploaded file and create a pending job. */
  async createJob(
    fileBuffer: Buffer,
    originalFileName: string,
    mimeType: string,
    userId: string,
  ): Promise<{ jobId: string }> {
    const job = this.jobRepo.create({
      status: 'pending',
      originalFileName,
      mimeType,
      originalFileBytes: fileBuffer,
      createdBy: userId,
    });
    const saved = await this.jobRepo.save(job);
    this.logger.log(`Import job created: ${saved.id} (${originalFileName})`);

    // Kick off the async pipeline without awaiting
    this.runPipeline(saved.id, fileBuffer, mimeType).catch((err) => {
      this.logger.error(`Pipeline failed for job ${saved.id}`, err);
    });

    return { jobId: saved.id };
  }

  /** Returns current job state for polling. */
  async getJob(jobId: string): Promise<Partial<ImportJobEntity>> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Import job ${jobId} not found`);

    // Don't send the raw binary file to the client in status polling
    const { originalFileBytes: _, ...rest } = job;
    return rest;
  }

  /** Returns the original file bytes for side-by-side comparison. */
  async getOriginalFile(jobId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId },
      select: ['id', 'originalFileBytes', 'mimeType', 'originalFileName'],
    });
    if (!job) throw new NotFoundException(`Import job ${jobId} not found`);
    if (!job.originalFileBytes) throw new BadRequestException('Original file not available');
    return { buffer: job.originalFileBytes, mimeType: job.mimeType, fileName: job.originalFileName };
  }

  /**
   * Accept or reject a suggestion from the Review Mode UI.
   */
  async respondToSuggestion(
    jobId: string,
    suggestionId: string,
    accepted: boolean,
    userId: string,
  ): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Import job ${jobId} not found`);
    if (!job.suggestions) return;

    const sug = job.suggestions.find((s) => s.id === suggestionId);
    if (!sug) throw new NotFoundException(`Suggestion ${suggestionId} not found`);
    sug.accepted = accepted;

    // If accepted and it's a fieldType change, update the schema
    if (accepted && sug.suggestionType === 'fieldType') {
      this.applyFieldTypeSuggestion(job, sug.fieldKey, sug.suggestedValue as string);
    }

    await this.jobRepo.save(job);
  }

  /**
   * User confirms review → save as a new draft document in the Document Engine.
   */
  async finalizeJob(
    jobId: string,
    formName: string,
    userId: string,
  ): Promise<{ documentId: string; versionId: string }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Import job ${jobId} not found`);
    if (job.status !== 'review') {
      throw new BadRequestException(`Job ${jobId} is in status "${job.status}", expected "review"`);
    }
    if (!job.generatedSchema) {
      throw new BadRequestException('No schema generated yet');
    }

    // Apply accepted suggestions to the schema before saving
    const finalSchema = this.applyAcceptedSuggestions(job);

    const doc = await this.documentService.createDocument({
      name: formName,
      category: 'clinical',
      documentTypeId: 'form',
      createdBy: userId,
    });

    const version = await this.documentService.createDraftVersion(doc.id, finalSchema, userId);

    job.status = 'finalized';
    job.finalizedDocumentId = doc.id;
    job.finalizedAt = new Date();
    job.reviewedBy = userId;
    await this.jobRepo.save(job);

    this.logger.log(`Import job ${jobId} finalized → document ${doc.id}, version ${version.id}`);
    return { documentId: doc.id, versionId: version.id };
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────

  private async runPipeline(jobId: string, buffer: Buffer, mimeType: string): Promise<void> {
    try {
      // Step 1: OCR
      await this.setStatus(jobId, 'ocr');
      const pages = await this.ocrProvider.extractText(buffer, mimeType);
      await this.jobRepo.update(jobId, { ocrResult: pages, pageCount: pages.length });

      // Step 2: Layout analysis
      await this.setStatus(jobId, 'layout');
      const elements = this.layoutAnalyzer.analyze(pages);
      await this.jobRepo.update(jobId, { layoutElements: elements });

      // Step 3: Semantic classification (AI-first)
      await this.setStatus(jobId, 'classifying');
      const titleEl = elements.find((e) => e.kind === 'title');
      const { fields, aiProviderUsed } = await this.semanticClassifier.classify(elements, {
        documentTitle: titleEl?.text,
      });

      const overallConfidence =
        fields.length > 0
          ? fields.reduce((s, f) => s + f.confidence, 0) / fields.length
          : 0;

      await this.jobRepo.update(jobId, {
        classifiedFields: fields,
        overallConfidence,
        aiProvider: aiProviderUsed,
      });

      // Step 4: Schema generation
      await this.setStatus(jobId, 'generating');
      const schema = this.schemaGenerator.generate(
        fields,
        titleEl?.text ?? 'Imported Form',
        pages.length,
      );
      await this.jobRepo.update(jobId, { generatedSchema: schema });

      // Step 5: Suggestions
      await this.setStatus(jobId, 'suggestions');
      const suggestions = this.suggestionEngine.generate(fields);
      await this.jobRepo.update(jobId, { suggestions });

      // Step 6: Ready for human review
      await this.setStatus(jobId, 'review');
      this.logger.log(`Import pipeline complete for job ${jobId} — awaiting human review.`);
    } catch (err: any) {
      this.logger.error(`Pipeline error for job ${jobId}: ${err.message}`, err.stack);
      await this.jobRepo.update(jobId, { status: 'failed', errorMessage: err.message });
    }
  }

  private async setStatus(jobId: string, status: ImportJobStatus): Promise<void> {
    await this.jobRepo.update(jobId, { status });
  }

  private applyFieldTypeSuggestion(job: ImportJobEntity, fieldKey: string, newType: string): void {
    if (!job.generatedSchema) return;
    const schema = job.generatedSchema as any;
    for (const page of schema.pages ?? []) {
      const comp = page.components?.find((c: any) => c.fieldKey === fieldKey);
      if (comp) { comp.type = newType; break; }
    }
  }

  private applyAcceptedSuggestions(job: ImportJobEntity): unknown {
    const schema = JSON.parse(JSON.stringify(job.generatedSchema)) as any;
    const accepted = (job.suggestions ?? []).filter((s) => s.accepted === true);

    for (const sug of accepted) {
      // Find the component across all pages
      let comp: any = null;
      for (const page of schema.pages ?? []) {
        comp = page.components?.find((c: any) => c.fieldKey === sug.fieldKey);
        if (comp) break;
      }
      if (!comp) continue;

      switch (sug.suggestionType) {
        case 'required':
          comp.props = { ...comp.props, required: true };
          break;
        case 'validation':
          comp.validation = [...(comp.validation ?? []), sug.suggestedValue];
          break;
        case 'options':
          comp.props = { ...comp.props, options: sug.suggestedValue };
          break;
        case 'fieldType':
          comp.type = sug.suggestedValue;
          break;
        case 'lookup':
          comp.props = { ...comp.props, lookup: sug.suggestedValue };
          break;
      }
    }
    return schema;
  }
}

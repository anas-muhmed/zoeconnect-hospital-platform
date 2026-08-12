import { Injectable, BadRequestException } from '@nestjs/common';
import { validateAnswersAgainstSchema, type FormSchema } from '@hdsp/form-schema';
import { DocumentService } from '../document-engine/services/document.service';
import { DocumentInstanceService, CreateInstanceInput } from '../document-engine/services/document-instance.service';
import { PdfEngineService } from '../document-engine/pdf/pdf-engine.service';
import { PdfArchivalService } from '../document-engine/services/pdf-archival.service';
import { PluginRegistryService } from './plugin-registry.service';
import { ExecutionContextBuilder } from './execution-context/execution-context.builder';
import { LifecycleOrchestratorService } from './execution-platform/lifecycle-orchestrator.service';

/**
 * FormsRuntimeService — the thin application-service layer behind the
 * Runtime API (ADR-015, Milestone 4). Delegates persistence to
 * DocumentService (published version lookup) and DocumentInstanceService
 * (fill/submit lifecycle) — this class's only real job is schema-aware
 * validation via @hdsp/form-schema's validateAnswersAgainstSchema, run
 * identically here (server, authoritative) and in the Renderer (client,
 * inline UX) per ADR-012's "re-validate on finalize" requirement.
 *
 * `BASIC_COMPONENT_DEFINITIONS` is hardcoded to Wave 1 for Milestone 4 — once
 * later waves register more components, this should read from a real
 * backend-side Component Registry (Phase 4A §7, deferred since Milestone 1 —
 * see that milestone's technical debt) rather than a fixed import. Flagged,
 * not silently glossed over.
 */
@Injectable()
export class FormsRuntimeService {
  constructor(
    private readonly documentService: DocumentService,
    private readonly instanceService: DocumentInstanceService,
    private readonly pdfEngineService: PdfEngineService,
    private readonly pdfArchivalService: PdfArchivalService,
    private readonly pluginRegistryService: PluginRegistryService,
    private readonly executionContextBuilder: ExecutionContextBuilder,
    private readonly lifecycleOrchestrator: LifecycleOrchestratorService,
  ) {}

  async getPublishedSchema(documentId: string): Promise<FormSchema> {
    const version = await this.documentService.getPublishedVersion(documentId);
    return version.payload as unknown as FormSchema;
  }

  async createInstance(documentId: string, input: Omit<CreateInstanceInput, 'documentVersionId'>) {
    const version = await this.documentService.getPublishedVersion(documentId);
    return this.instanceService.createInstance({ ...input, documentVersionId: version.id });
  }

  async getInstance(instanceId: string) {
    return this.instanceService.getInstance(instanceId);
  }

  async saveAnswers(instanceId: string, answers: Record<string, unknown>, expectedVersion: number) {
    return this.lifecycleOrchestrator.orchestrateSave(instanceId, answers, expectedVersion);
  }

  /**
   * Finalizes an instance (the "Submit" step)
   */
  async finalizeInstance(instanceId: string, submittedBy: string, expectedVersion: number) {
    const finalizedInstance = await this.lifecycleOrchestrator.orchestrateFinalize(instanceId, submittedBy, expectedVersion);
    
    // ADR-013: PDF Preview & Archival to static buckets as immutable legal records
    await this.pdfArchivalService.archiveInstance(instanceId);
    
    return finalizedInstance;
  }

  async getSchemaForInstance(instanceId: string): Promise<FormSchema> {
    const instance = await this.instanceService.getInstance(instanceId);
    const version = await this.documentService.getVersionById(instance.documentVersionId);
    return version.payload as unknown as FormSchema;
  }

  /**
   * Generates a PDF for a finalized form instance (Milestone 4 exit criterion,
   * ADR-002 Phase 4A §2.1). Delegates to PdfEngineService which dispatches to
   * the 'form' DocumentTypeDefinition's registered pdfRenderer — this method
   * does not know how the PDF is built (correct per ADR-002: platform service,
   * not application-layer logic).
   *
   * Only finalized instances can produce PDFs — a partially-filled in_progress
   * instance may have invalid/incomplete answers that would produce a misleading
   * document. This mirrors ADR-001's draft-immutability principle applied to
   * instance lifecycle.
   */
  async generateInstancePdf(instanceId: string): Promise<Buffer> {
    const instance = await this.instanceService.getInstance(instanceId);
    
    if (instance.status !== 'completed' && instance.status !== 'archived') {
      throw new BadRequestException(`PDF can only be generated for completed or archived instances. Current status: ${instance.status}`);
    }
    const version = await this.documentService.getVersionById(instance.documentVersionId);
    return this.pdfEngineService.generatePdf(
      'form',
      version.payload,
      instance.answers,
    );
  }
}

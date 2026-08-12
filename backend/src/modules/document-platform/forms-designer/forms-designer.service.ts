import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import type { FormSchema } from '@hdsp/form-schema';
import { DocumentService } from '../document-engine/services/document.service';
import { DocumentTypeRegistryService } from '../document-engine/document-type-registry/document-type-registry.service';

/**
 * FormsDesignerService — the thin application-service layer behind the
 * Designer API (ADR-015, Milestone 3). Delegates all persistence to the
 * generic DocumentService (Milestone 1); this class exists only to bind the
 * 'form' document type and to run FormSchema validation before anything is
 * written, per the DocumentTypeDefinition.schemaValidator contract (ADR-002).
 *
 * Validation here is the structural `isFormSchema` guard, not a full zod deep
 * validation — deferred until the Rule Engine (Milestone 5) exists to
 * exercise RuleExpression validation meaningfully. Logged as a scope
 * decision, not a silent gap.
 *
 * Milestone 4 adds `publishVersion` — a deliberately minimal, single-step
 * publish action (no approval chain; see DocumentService.transitionVersionStatus's
 * docblock) so the Runtime has a published schema to fill against. The real
 * Configurable Workflow Engine is Milestone 5's job.
 */
@Injectable()
export class FormsDesignerService {
  constructor(
    private readonly documentService: DocumentService,
    private readonly typeRegistry: DocumentTypeRegistryService,
  ) {}

  private validateSchema(schema: unknown): asserts schema is FormSchema {
    const result = this.typeRegistry.get('form')!.schemaValidator(schema);
    if (!result.valid) {
      throw new BadRequestException(`Invalid FormSchema: ${result.errors.join('; ')}`);
    }
  }

  async createTemplate(input: { name: string; category: string; isMultiBranch?: boolean }, userId: string) {
    return this.documentService.createDocument({
      documentTypeId: 'form',
      name: input.name,
      category: input.category,
      isMultiBranch: input.isMultiBranch,
      createdBy: userId,
    });
  }

  async getTemplate(documentId: string) {
    return this.documentService.getDocument(documentId);
  }

  async listTemplates(limit: number = 50, offset: number = 0) {
    return this.documentService.listDocuments('form', limit, offset);
  }

  async saveDraftVersion(documentId: string, schema: unknown, userId: string) {
    this.validateSchema(schema);
    return this.documentService.createDraftVersion(documentId, schema as unknown as Record<string, unknown>, userId);
  }

  async updateDraftVersion(documentId: string, versionId: string, schema: unknown) {
    this.validateSchema(schema);
    return this.documentService.updateDraftVersion(documentId, versionId, schema as unknown as Record<string, unknown>);
  }

  async getVersion(documentId: string, versionId: string) {
    return this.documentService.getVersion(documentId, versionId);
  }

  async listVersions(documentId: string) {
    return this.documentService.listVersions(documentId);
  }

  /**
   * Publishes a draft version directly (Milestone 4 stopgap — no approval
   * chain). Rejects publishing anything that isn't currently 'draft', so
   * this can't be used to "re-publish" or bypass ADR-001 immutability.
   */
  async publishVersion(documentId: string, versionId: string) {
    const version = await this.documentService.getVersion(documentId, versionId);
    if (version.status !== 'draft') {
      throw new ConflictException(`Version ${versionId} is not a draft (status: ${version.status}); only drafts can be published.`);
    }
    return this.documentService.transitionVersionStatus(documentId, versionId, 'published');
  }
}

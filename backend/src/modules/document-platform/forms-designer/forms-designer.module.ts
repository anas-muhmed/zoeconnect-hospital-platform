import { Module, OnModuleInit } from '@nestjs/common';
import { isFormSchema } from '@hdsp/form-schema';
import { DocumentEngineModule } from '../document-engine/document-engine.module';
import { DocumentTypeRegistryService } from '../document-engine/document-type-registry/document-type-registry.service';
import { FormsDesignerService } from './forms-designer.service';
import { FormsDesignerController } from './forms-designer.controller';
import { formPdfRenderer } from './pdf/form-pdf-renderer';

/**
 * FormsDesignerModule (Milestone 3, ADR-002/ADR-015) — registers 'form' as a
 * real DocumentTypeDefinition (superseding Milestone 1's synthetic 'test'
 * type for actual use) and exposes the Designer API. `defaultWorkflowDefinitionId`
 * is a placeholder ('none') since the Configurable Workflow Engine doesn't
 * exist until Milestone 5 (ADR-008); `supportsSignatures`/`supportsBranchOverride`
 * are forward-declared true per Phase 1's approved scope even though neither
 * capability is implemented yet (Milestone 6/5 respectively) — the document
 * type's *capability declaration* is stable even as the underlying engines
 * that fulfill it land incrementally.
 */
@Module({
  imports: [DocumentEngineModule],
  controllers: [FormsDesignerController],
  providers: [FormsDesignerService],
  exports: [FormsDesignerService],
})
export class FormsDesignerModule implements OnModuleInit {
  constructor(private readonly typeRegistry: DocumentTypeRegistryService) {}

  onModuleInit() {
    if (!this.typeRegistry.has('form')) {
      this.typeRegistry.register({
        id: 'form',
        displayName: 'Dynamic Patient Form',
        schemaValidator: (payload: unknown) =>
          isFormSchema(payload) ? { valid: true, errors: [] } : { valid: false, errors: ['Payload is not a structurally valid FormSchema.'] },
        /**
         * pdfRenderer — Wave-1-capable form PDF renderer (Milestone 4, ADR-002
         * Phase 4A §2.1). Registered here (Forms application-layer code) rather
         * than in PdfEngineService (Document Platform code) because it knows
         * about FormSchema specifically. PdfEngineService dispatches to this
         * callback generically, never inspecting its implementation.
         */
        pdfRenderer: formPdfRenderer,
        defaultWorkflowDefinitionId: 'none',
        supportsSignatures: true,
        supportsBranchOverride: true,
      });
    }
  }
}

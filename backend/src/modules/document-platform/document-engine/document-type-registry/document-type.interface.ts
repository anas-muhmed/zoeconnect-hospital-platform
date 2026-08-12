/**
 * DocumentTypeDefinition — the registration contract a consumer module (e.g.
 * dynamic-forms registering 'form') implements to plug into the generic
 * Document Engine (ADR-002).
 *
 * Milestone 1: interface skeleton + in-memory registry.
 * Milestone 3: 'form' document type registered by FormsDesignerModule.
 * Milestone 4: `pdfRenderer` added — previously acknowledged in a docblock
 *   comment but absent from the TypeScript interface (an omission, not an
 *   intentional deferral per the Phase 4A §2.1 / MILESTONE_PLAN.md scope).
 *   The PdfEngineService (document-engine/pdf/) dispatches to this callback;
 *   the callback is optional (undefined = document type does not support PDF).
 *
 * `pdfRenderer` is typed as a loose async callback (`unknown` payload in,
 * `Buffer` out) because the Rule Engine and Workflow Engine — which future
 * milestones may pipe through before PDF generation — are not yet present.
 * Tightening the payload type is expected as those engines land.
 */
export interface DocumentTypeDefinition {
  id: string;
  displayName: string;
  schemaValidator: (payload: unknown) => { valid: boolean; errors: string[] };
  /**
   * Renders a finalized document instance's payload + answers to a PDF Buffer.
   * Called by PdfEngineService (ADR-002 — PDF generation belongs to the
   * Document Engine, not to application-layer modules).
   *
   * Optional: a document type that does not support PDF generation may omit
   * this field; PdfEngineService will throw `UnsupportedOperationException`
   * with a clear message rather than a generic runtime crash.
   */
  pdfRenderer?: (payload: unknown, answers: Record<string, unknown>) => Promise<Buffer>;
  defaultWorkflowDefinitionId: string;
  supportsSignatures: boolean;
  supportsBranchOverride: boolean;
}

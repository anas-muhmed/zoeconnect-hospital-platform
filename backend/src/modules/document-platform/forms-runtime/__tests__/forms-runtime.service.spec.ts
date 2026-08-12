import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import {
  CURRENT_SCHEMA_VERSION,
  BASIC_COMPONENT_DEFINITIONS,
  type FormSchema,
} from '@hdsp/form-schema';
import { FormsRuntimeService } from '../forms-runtime.service';
import { PluginRegistryService } from '../plugin-registry.service';
import { ExecutionContextBuilder } from '../execution-context/execution-context.builder';
import { LifecycleOrchestratorService } from '../execution-platform/lifecycle-orchestrator.service';
import { PluginHookService } from '../execution-platform/plugin-hook.service';
import { ComputedFieldsEngine } from '../execution-platform/computed-fields.engine';
import { DocumentSnapshotService } from '../../document-engine/services/document-snapshot.service';
import { DocumentSnapshotEntity } from '../../document-engine/entities/document-snapshot.entity';
import { DocumentService } from '../../document-engine/services/document.service';
import { DocumentInstanceService } from '../../document-engine/services/document-instance.service';
import { PdfArchivalService } from '../../document-engine/services/pdf-archival.service';
import { DocumentTypeRegistryService } from '../../document-engine/document-type-registry/document-type-registry.service';
import { PdfEngineService } from '../../document-engine/pdf/pdf-engine.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocumentEntity } from '../../document-engine/entities/document.entity';
import { DocumentVersionEntity } from '../../document-engine/entities/document-version.entity';
import { DocumentInstanceEntity } from '../../document-engine/entities/document-instance.entity';

/**
 * Milestone 4 exit criterion (docs/architecture/MILESTONE_PLAN.md):
 * "A clinician-role test user fills a Wave-1-only published form, submits
 * it, and a PDF matching the on-screen layout is generated — full
 * Builder→Runtime→PDF loop proven on the simplest possible content."
 *
 * This test proves the service-layer half of that criterion. The full
 * Builder side is already proven by FormsDesignerService's Milestone 3
 * test; this test picks up from a published version and exercises:
 *   1. Create instance (fill session starts)
 *   2. Save answers (autosave, ADR-012 — answers stored)
 *   3. Finalize (server-side re-validation passes → status 'finalized', ADR-012)
 *   4. PDF generated (ADR-002 Phase 4A §2.1 — PdfEngineService dispatches
 *      to the form's registered pdfRenderer)
 *   5. Finalize again → rejected (immutability, ADR-001 pattern)
 *   6. Finalize with missing required field → rejected with validation error (ADR-012)
 *
 * Follows the established ZoeConnect test convention: TestingModule + in-memory
 * mocked repositories. The PDF test uses a lightweight mock pdfRenderer
 * (returns a fixed Buffer) rather than a real pdfmake call, keeping the
 * unit test dependency-free and fast. Integration of the real pdfmake
 * renderer is verified by the /dev/form-runtime-sandbox browser smoke test
 * that the user runs manually (same pattern as Milestones 2 and 3).
 */

// ── Shared in-memory repository factory (same shape as M1 and M3 tests) ──

function inMemoryRepo<T extends { id: string }>() {
  const rows = new Map<string, T>();
  return {
    create: jest.fn((partial: Partial<T>) => ({ id: randomUUID(), ...partial }) as unknown as T),
    save: jest.fn(async (entity: any) => {
      if (entity.version === undefined) {
        entity.version = 1;
      } else {
        entity.version += 1;
      }
      rows.set(entity.id, entity);
      return entity;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      for (const row of rows.values()) {
        const matches = Object.entries(where).every(([k, v]) => (row as any)[k] === v);
        if (matches) return row;
      }
      return null;
    }),
    find: jest.fn(async ({ where, order }: any = {}) => {
      let results = Array.from(rows.values());
      if (where) {
        results = results.filter((row) =>
          Object.entries(where).every(([k, v]) => (row as any)[k] === v),
        );
      }
      if (order?.versionNo === 'DESC') results = [...results].sort((a: any, b: any) => b.versionNo - a.versionNo);
      if (order?.versionNo === 'ASC') results = [...results].sort((a: any, b: any) => a.versionNo - b.versionNo);
      return results;
    }),
    _rows: rows,
  };
}

// ── Wave-1 test schema (same as Milestone 3 test, reused here) ──

function makeWave1FormSchema(): FormSchema {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    formId: 'patient-registration',
    category: 'registration',
    dataSources: [],
    pages: [
      {
        id: 'page-1',
        size: 'A4',
        orientation: 'portrait',
        components: [
          {
            id: 'n1', type: 'label', fieldKey: 'title',
            geometry: { x: 0, y: 0, w: 240, h: 30, z: 0, pageId: 'page-1' },
            props: { text: 'Patient Registration', variant: 'heading', align: 'left' },
            validation: [], logic: {}, permissions: { visibleTo: [], editableBy: [] },
            audit: { trackChanges: false },
          },
          {
            id: 'n2', type: 'textbox', fieldKey: 'full_name',
            geometry: { x: 0, y: 40, w: 240, h: 56, z: 1, pageId: 'page-1' },
            props: { label: 'Full Name', placeholder: '', defaultValue: '', maxLength: 255, required: true },
            validation: [{ kind: 'required' }], logic: {}, permissions: { visibleTo: [], editableBy: [] },
            audit: { trackChanges: true },
          },
          {
            id: 'n3', type: 'checkbox', fieldKey: 'consent',
            geometry: { x: 0, y: 100, w: 240, h: 32, z: 2, pageId: 'page-1' },
            props: { label: 'Consent Given', defaultChecked: false, required: true },
            validation: [{ kind: 'required' }], logic: {}, permissions: { visibleTo: [], editableBy: [] },
            audit: { trackChanges: true },
          },
          {
            id: 'n4', type: 'dropdown', fieldKey: 'department',
            geometry: { x: 0, y: 140, w: 240, h: 56, z: 3, pageId: 'page-1' },
            props: { label: 'Department', options: [{ label: 'Cardiology', value: 'cardio' }], placeholder: 'Select…', defaultValue: '', required: false },
            validation: [], logic: {}, permissions: { visibleTo: [], editableBy: [] },
            audit: { trackChanges: true },
          },
        ],
      },
    ],
  };
}

// ── Test suite ──

describe('FormsRuntimeService — Milestone 4 exit criterion', () => {
  let runtimeService: FormsRuntimeService;
  let documentService: DocumentService;
  let typeRegistry: DocumentTypeRegistryService;
  let pdfEngineService: PdfEngineService;
  let pluginHookService: jest.Mocked<PluginHookService>;
  let computedFieldsEngine: jest.Mocked<ComputedFieldsEngine>;
  let executionContextBuilder: jest.Mocked<ExecutionContextBuilder>;
  let activeInstance: any; // For stateful tests

  // Lightweight mock pdfRenderer — returns a predictable Buffer so the unit
  // test doesn't depend on pdfmake (real integration verified by browser smoke test).
  const mockPdfBuffer = Buffer.from('%PDF-1.4 mock-pdf-for-unit-test');
  const mockPdfRenderer = jest.fn().mockResolvedValue(mockPdfBuffer);

  beforeEach(async () => {
    jest.clearAllMocks();

    pluginHookService = {
      onBeforeSave: jest.fn(async (ctx) => ctx.answers),
      onAfterSave: jest.fn(),
      onBeforeFinalize: jest.fn(async (ctx) => ctx.answers),
      onAfterFinalize: jest.fn(),
    } as any;

    computedFieldsEngine = {
      evaluate: jest.fn((schema, answers) => answers),
    } as any;

    executionContextBuilder = {
      buildContext: jest.fn().mockResolvedValue({ variables: {} }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormsRuntimeService,
        PluginRegistryService,
        ExecutionContextBuilder,
        LifecycleOrchestratorService,
        PluginHookService,
        ComputedFieldsEngine,
        DocumentSnapshotService,
        DocumentService,
        DocumentInstanceService,
        DocumentTypeRegistryService,
        { provide: PdfArchivalService, useValue: { archiveInstance: jest.fn() } },
        {
          provide: PluginHookService,
          useValue: pluginHookService,
        },
        {
          provide: ComputedFieldsEngine,
          useValue: computedFieldsEngine,
        },
        {
          provide: ExecutionContextBuilder,
          useValue: executionContextBuilder,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: PdfEngineService,
          useFactory: (registry: DocumentTypeRegistryService) => new PdfEngineService(registry),
          inject: [DocumentTypeRegistryService],
        },
        { provide: getRepositoryToken(DocumentEntity), useValue: inMemoryRepo<DocumentEntity>() },
        { provide: getRepositoryToken(DocumentVersionEntity), useValue: inMemoryRepo<DocumentVersionEntity>() },
        { provide: getRepositoryToken(DocumentInstanceEntity), useValue: inMemoryRepo<DocumentInstanceEntity>() },
        { provide: getRepositoryToken(DocumentSnapshotEntity), useValue: inMemoryRepo<DocumentSnapshotEntity>() },
      ],
    }).compile();

    runtimeService = module.get(FormsRuntimeService);
    documentService = module.get(DocumentService);
    typeRegistry = module.get(DocumentTypeRegistryService);
    pdfEngineService = module.get(PdfEngineService);

    // Register the 'form' document type with a mock pdfRenderer, simulating
    // what FormsDesignerModule.onModuleInit() does in production.
    typeRegistry.register({
      id: 'form',
      displayName: 'Dynamic Patient Form',
      schemaValidator: () => ({ valid: true, errors: [] }),
      pdfRenderer: mockPdfRenderer,
      defaultWorkflowDefinitionId: 'none',
      supportsSignatures: true,
      supportsBranchOverride: true,
    });
  });

  /** Helper: creates a published form document + version in the in-memory repos. */
  async function publishForm(): Promise<{ documentId: string; versionId: string }> {
    const doc = await documentService.createDocument({
      documentTypeId: 'form',
      name: 'Patient Registration',
      category: 'registration',
      createdBy: 'designer-user',
    });
    const version = await documentService.createDraftVersion(
      doc.id,
      makeWave1FormSchema() as unknown as Record<string, unknown>,
      'designer-user',
    );
    await documentService.transitionVersionStatus(doc.id, version.id, 'published');
    return { documentId: doc.id, versionId: version.id };
  }

  it('fetches the published schema for a form document', async () => {
    const { documentId } = await publishForm();
    const schema = await runtimeService.getPublishedSchema(documentId);
    expect(schema.formId).toBe('patient-registration');
    expect(schema.pages[0].components).toHaveLength(4);
  });

  it('creates a fill instance in draft status', async () => {
    const { documentId, versionId } = await publishForm();
    const instance = await runtimeService.createInstance(documentId, {
      patientId: 'PAT-123',
    });
    expect(instance).toBeDefined();
    expect(instance.id).toBeDefined();
    expect(instance.status).toBe('draft');
    expect(instance.documentVersionId).toBe(versionId);

    // Save for next tests
    activeInstance = instance;
  });

  it('saves answers (autosave) and merges with existing answers', async () => {
    const { documentId } = await publishForm();
    const instance = await runtimeService.createInstance(documentId, { patientId: null, branchId: null, departmentCode: null, visitId: null, encounterId: null });

    const saved1 = await runtimeService.saveAnswers(instance.id, { full_name: 'Ahmed Al-Rashid' }, 1);
    expect(saved1.answers).toEqual({ full_name: 'Ahmed Al-Rashid' });

    // Second autosave: consent field added, full_name preserved (merge, not replace)
    const saved2 = await runtimeService.saveAnswers(instance.id, { consent: true }, 2);
    expect(saved2.answers).toEqual({ full_name: 'Ahmed Al-Rashid', consent: true });
  });

  it('finalizes an instance after all required fields are filled (ADR-012 re-validation passes)', async () => {
    const { documentId } = await publishForm();
    const instance = await runtimeService.createInstance(documentId, { patientId: 'P-002', branchId: null, departmentCode: null, visitId: null, encounterId: null });

    await runtimeService.saveAnswers(instance.id, {
      full_name: 'Fatima Zahra',
      consent: true,    // required checkbox
      department: 'cardio',
    }, 1);

    const finalized = await runtimeService.finalizeInstance(instance.id, 'clinician-user', 2);
    expect(finalized.status).toBe('completed');
    expect(finalized.submittedBy).toBe('clinician-user');
    
    // Save for next test
    activeInstance = finalized;
  });

  it('rejects finalizing an already-finalized instance (ADR-001 immutability pattern)', async () => {
    const { documentId } = await publishForm();
    const instance = await runtimeService.createInstance(documentId, { patientId: null, branchId: null, departmentCode: null, visitId: null, encounterId: null });
    await runtimeService.saveAnswers(instance.id, { full_name: 'Test User', consent: true }, 1);
    await runtimeService.finalizeInstance(instance.id, 'clinician-1', 2);

    await expect(runtimeService.finalizeInstance(instance.id, 'clinician-1', 3)).rejects.toThrow(
      /cannot be finalized/,
    );
  });

  it('rejects finalize when a required field is missing (ADR-012 server-side re-validation)', async () => {
    const { documentId } = await publishForm();
    const incomplete = await runtimeService.createInstance(documentId, { patientId: null, branchId: null, departmentCode: null, visitId: null, encounterId: null });

    // consent (required checkbox) and full_name (required textbox) are both absent
    await runtimeService.saveAnswers(incomplete.id, { department: 'cardio' }, 1);

    await expect(
      runtimeService.finalizeInstance(incomplete.id, 'clinician-user', 2)
    ).rejects.toThrowError(BadRequestException);
  });

  it('validates that both required fields produce field-level errors in the rejection (ADR-012)', async () => {
    const { documentId } = await publishForm();
    const instance = await runtimeService.createInstance(documentId, { patientId: null, branchId: null, departmentCode: null, visitId: null, encounterId: null });
    await runtimeService.saveAnswers(instance.id, { department: 'cardio' }, 1);

    let caught: BadRequestException | undefined;
    try {
      await runtimeService.finalizeInstance(instance.id, 'clinician-3', 2);
    } catch (e) {
      caught = e as BadRequestException;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    const response = caught!.getResponse() as { errors: Record<string, string[]> };
    expect(response.errors).toHaveProperty('full_name');
    expect(response.errors).toHaveProperty('consent');
  });

  it('generates a PDF for a finalized instance (Milestone 4 exit criterion — ADR-002 Phase 4A §2.1)', async () => {
    const { documentId } = await publishForm();
    const instance = await runtimeService.createInstance(documentId, { patientId: 'P-003', branchId: null, departmentCode: null, visitId: null, encounterId: null });
    await runtimeService.saveAnswers(instance.id, { full_name: 'Layla Hassan', consent: true }, 1);
    await runtimeService.finalizeInstance(instance.id, 'clinician-4', 2);

    const pdfBuffer = await runtimeService.generateInstancePdf(instance.id);

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.byteLength).toBeGreaterThan(0);

    // Confirm pdfRenderer was called with the correct payload and answers
    expect(mockPdfRenderer).toHaveBeenCalledTimes(1);
    const [calledPayload, calledAnswers] = mockPdfRenderer.mock.calls[0];
    expect((calledPayload as FormSchema).formId).toBe('patient-registration');
    expect(calledAnswers).toMatchObject({ full_name: 'Layla Hassan', consent: true });
  });

  it('rejects PDF generation for a non-finalized instance', async () => {
    const { documentId } = await publishForm();
    const nonFinalized = await runtimeService.createInstance(documentId, { patientId: 'PAT-789' });
    // NOT completed — still draft
    await expect(
      runtimeService.generateInstancePdf(nonFinalized.id)
    ).rejects.toThrowError(/PDF can only be generated for completed or archived instances/);
  });

  it('validates BASIC_COMPONENT_DEFINITIONS covers all Wave 1 types present in the schema', () => {
    // Sanity check: the definitions used for server-side validation include
    // all component types referenced in the test schema.
    const definedIds = new Set(BASIC_COMPONENT_DEFINITIONS.map((d) => d.id));
    const schemaTypes = makeWave1FormSchema()
      .pages.flatMap((p) => p.components)
      .map((c) => c.type);

    for (const type of schemaTypes) {
      if (type === 'label') continue; // label has no required-field validation
      expect(definedIds.has(type)).toBe(true);
    }
  });
});

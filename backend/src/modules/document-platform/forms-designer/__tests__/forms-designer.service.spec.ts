import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { isFormSchema, CURRENT_SCHEMA_VERSION, type FormSchema } from '@hdsp/form-schema';
import { FormsDesignerService } from '../forms-designer.service';
import { DocumentService } from '../../document-engine/services/document.service';
import { DocumentEntity } from '../../document-engine/entities/document.entity';
import { DocumentVersionEntity } from '../../document-engine/entities/document-version.entity';
import { DocumentTypeRegistryService } from '../../document-engine/document-type-registry/document-type-registry.service';

/**
 * Milestone 3 exit criterion, at the Document Engine layer (not just the
 * canvas-engine schema-bridge's in-memory round trip): "A designer builds a
 * simple form with all six Wave 1 components, saves it, reloads the page,
 * and sees the identical schema restored — verified by an automated
 * round-trip test." This proves the save/reload trip through the real
 * DocumentService (Milestone 1), not a mock of it.
 *
 * Follows the Milestone 1 test convention (document.service.spec.ts):
 * TestingModule + in-memory mocked repositories, not a real Postgres instance.
 */
function inMemoryRepo<T extends { id: string }>() {
  const rows = new Map<string, T>();
  return {
    create: jest.fn((partial: Partial<T>) => ({ id: randomUUID(), ...partial }) as T),
    save: jest.fn(async (entity: T) => {
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
        results = results.filter((row) => Object.entries(where).every(([k, v]) => (row as any)[k] === v));
      }
      if (order?.versionNo === 'DESC') results = [...results].sort((a: any, b: any) => b.versionNo - a.versionNo);
      if (order?.versionNo === 'ASC') results = [...results].sort((a: any, b: any) => a.versionNo - b.versionNo);
      return results;
    }),
  };
}

function asFormSchema(payload: Record<string, unknown>): FormSchema {
  return payload as unknown as FormSchema;
}

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
          { id: 'n1', type: 'label', fieldKey: 'title', geometry: { x: 0, y: 0, w: 240, h: 30, z: 0, pageId: 'page-1' }, props: { text: 'Patient Registration', variant: 'heading', align: 'left' }, validation: [], logic: {}, permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: false } },
          { id: 'n2', type: 'textbox', fieldKey: 'full_name', geometry: { x: 0, y: 40, w: 240, h: 56, z: 1, pageId: 'page-1' }, props: { label: 'Full Name', placeholder: '', defaultValue: '', maxLength: 255, required: true }, validation: [{ kind: 'required' }], logic: {}, permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: true } },
          { id: 'n3', type: 'textarea', fieldKey: 'notes', geometry: { x: 0, y: 100, w: 240, h: 120, z: 2, pageId: 'page-1' }, props: { label: 'Notes', placeholder: '', defaultValue: '', rows: 4, maxLength: 500, required: false }, validation: [], logic: {}, permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: true } },
          { id: 'n4', type: 'checkbox', fieldKey: 'consent', geometry: { x: 0, y: 230, w: 240, h: 32, z: 3, pageId: 'page-1' }, props: { label: 'Consent Given', defaultChecked: false, required: true }, validation: [{ kind: 'required' }], logic: {}, permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: true } },
          { id: 'n5', type: 'radio', fieldKey: 'gender', geometry: { x: 0, y: 270, w: 240, h: 90, z: 4, pageId: 'page-1' }, props: { label: 'Gender', options: [{ label: 'Male', value: 'm' }, { label: 'Female', value: 'f' }], defaultValue: '', required: true }, validation: [{ kind: 'required' }], logic: {}, permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: true } },
          { id: 'n6', type: 'dropdown', fieldKey: 'department', geometry: { x: 0, y: 370, w: 240, h: 56, z: 5, pageId: 'page-1' }, props: { label: 'Department', options: [{ label: 'Cardiology', value: 'cardio' }], placeholder: 'Select…', defaultValue: '', required: false }, validation: [], logic: {}, permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: true } },
        ],
      },
    ],
  };
}

describe('FormsDesignerService — Milestone 3 exit criterion', () => {
  let service: FormsDesignerService;
  let typeRegistry: DocumentTypeRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormsDesignerService,
        DocumentService,
        DocumentTypeRegistryService,
        { provide: getRepositoryToken(DocumentEntity), useValue: inMemoryRepo<DocumentEntity>() },
        { provide: getRepositoryToken(DocumentVersionEntity), useValue: inMemoryRepo<DocumentVersionEntity>() },
      ],
    }).compile();

    service = module.get(FormsDesignerService);
    typeRegistry = module.get(DocumentTypeRegistryService);

    // Simulate FormsDesignerModule.onModuleInit's registration.
    typeRegistry.register({
      id: 'form',
      displayName: 'Dynamic Patient Form',
      schemaValidator: (payload: unknown) =>
        isFormSchema(payload) ? { valid: true, errors: [] } : { valid: false, errors: ['not a FormSchema'] },
      defaultWorkflowDefinitionId: 'none',
      supportsSignatures: true,
      supportsBranchOverride: true,
    });
  });

  it('builds a form with all six Wave 1 components, saves it, reloads, and sees an identical schema restored', async () => {
    const doc = await service.createTemplate({ name: 'Patient Registration', category: 'registration' }, 'designer-1');
    const schema = makeWave1FormSchema();

    const savedVersion = await service.saveDraftVersion(doc.id, schema, 'designer-1');
    expect(savedVersion.versionNo).toBe(1);
    expect(savedVersion.status).toBe('draft');

    // "Reload the page": fetch the version back exactly as a browser refresh would.
    const reloaded = await service.getVersion(doc.id, savedVersion.id);

    expect(reloaded.payload).toEqual(schema);
    const reloadedSchema = asFormSchema(reloaded.payload);
    expect(reloadedSchema.pages[0].components).toHaveLength(6);
    expect(reloadedSchema.pages[0].components.map((c) => c.type).sort()).toEqual(
      ['checkbox', 'dropdown', 'label', 'radio', 'textarea', 'textbox'],
    );
  });

  it('rejects saving a payload that is not a structurally valid FormSchema', async () => {
    const doc = await service.createTemplate({ name: 'Broken', category: 'custom' }, 'u');
    await expect(service.saveDraftVersion(doc.id, { not: 'a schema' }, 'u')).rejects.toThrow(BadRequestException);
  });

  it('allows editing a draft version schema in place, and re-reloading reflects the edit (ADR-001)', async () => {
    const doc = await service.createTemplate({ name: 'Editable', category: 'custom' }, 'u');
    const v1 = await service.saveDraftVersion(doc.id, makeWave1FormSchema(), 'u');

    const edited = makeWave1FormSchema();
    edited.pages[0].components[0].props = { text: 'Updated Title', variant: 'heading', align: 'center' };
    await service.updateDraftVersion(doc.id, v1.id, edited);

    const reloaded = await service.getVersion(doc.id, v1.id);
    const reloadedSchema = asFormSchema(reloaded.payload);
    expect(reloadedSchema.pages[0].components[0].props).toEqual({
      text: 'Updated Title',
      variant: 'heading',
      align: 'center',
    });
  });
});

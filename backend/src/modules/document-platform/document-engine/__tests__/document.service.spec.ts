import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DocumentService } from '../services/document.service';
import { DocumentEntity } from '../entities/document.entity';
import { DocumentVersionEntity } from '../entities/document-version.entity';
import { DocumentTypeRegistryService } from '../document-type-registry/document-type-registry.service';

/**
 * Milestone 1 exit-criterion test (docs/architecture/MILESTONE_PLAN.md):
 * "a synthetic 'test' document type can be created, versioned, and fetched via
 * service-layer calls in an integration test — no controllers required yet."
 *
 * Follows the existing ZoeConnect test convention (see modules/licensing/__tests__/
 * license.service.spec.ts): TestingModule + mocked repositories, not a real
 * Postgres instance. A disposable-Postgres integration test harness is Phase 6
 * hardening (docs/architecture/MILESTONE_PLAN.md Milestone 7), not Milestone 1
 * scope.
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
        results = results.filter((row) =>
          Object.entries(where).every(([k, v]) => (row as any)[k] === v),
        );
      }
      if (order?.versionNo === 'DESC') {
        results = [...results].sort((a: any, b: any) => b.versionNo - a.versionNo);
      }
      if (order?.versionNo === 'ASC') {
        results = [...results].sort((a: any, b: any) => a.versionNo - b.versionNo);
      }
      return results;
    }),
    _rows: rows,
  };
}

describe('DocumentService — Milestone 1 exit criterion', () => {
  let service: DocumentService;
  let registry: DocumentTypeRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        DocumentTypeRegistryService,
        { provide: getRepositoryToken(DocumentEntity), useValue: inMemoryRepo<DocumentEntity>() },
        { provide: getRepositoryToken(DocumentVersionEntity), useValue: inMemoryRepo<DocumentVersionEntity>() },
      ],
    }).compile();

    service = module.get(DocumentService);
    registry = module.get(DocumentTypeRegistryService);
  });

  it('registers a synthetic "test" document type (ADR-002)', () => {
    registry.register({
      id: 'test',
      displayName: 'Synthetic Test Document Type',
      schemaValidator: () => ({ valid: true, errors: [] }),
      defaultWorkflowDefinitionId: 'none',
      supportsSignatures: false,
      supportsBranchOverride: false,
    });
    expect(registry.has('test')).toBe(true);
    expect(registry.get('test')?.displayName).toBe('Synthetic Test Document Type');
  });

  it('creates a document, creates a draft version, and fetches both back (create → version → fetch)', async () => {
    const doc = await service.createDocument({
      documentTypeId: 'test',
      name: 'Synthetic Test Document',
      category: 'custom',
      createdBy: 'test-user',
    });
    expect(doc.id).toBeDefined();
    expect(doc.documentTypeId).toBe('test');

    const version = await service.createDraftVersion(doc.id, { hello: 'world' }, 'test-user');
    expect(version.versionNo).toBe(1);
    expect(version.status).toBe('draft');

    const fetchedDoc = await service.getDocument(doc.id);
    expect(fetchedDoc.name).toBe('Synthetic Test Document');

    const fetchedVersion = await service.getVersion(doc.id, version.id);
    expect(fetchedVersion.payload).toEqual({ hello: 'world' });
  });

  it('increments version numbers per document', async () => {
    const doc = await service.createDocument({
      documentTypeId: 'test',
      name: 'Multi-version Document',
      category: 'custom',
      createdBy: 'test-user',
    });
    const v1 = await service.createDraftVersion(doc.id, { step: 1 }, 'test-user');
    const v2 = await service.createDraftVersion(doc.id, { step: 2 }, 'test-user');

    expect(v1.versionNo).toBe(1);
    expect(v2.versionNo).toBe(2);

    const all = await service.listVersions(doc.id);
    expect(all.map((v) => v.versionNo)).toEqual([1, 2]);
  });

  it('allows editing a draft version, per ADR-001 (draft is the only mutable state)', async () => {
    const doc = await service.createDocument({
      documentTypeId: 'test', name: 'Editable Draft', category: 'custom', createdBy: 'u',
    });
    const version = await service.createDraftVersion(doc.id, { a: 1 }, 'u');
    const updated = await service.updateDraftVersion(doc.id, version.id, { a: 2 });
    expect(updated.payload).toEqual({ a: 2 });
  });

  it('rejects editing a non-draft version (ADR-001 immutability)', async () => {
    const doc = await service.createDocument({
      documentTypeId: 'test', name: 'Immutable Once Published', category: 'custom', createdBy: 'u',
    });
    const version = await service.createDraftVersion(doc.id, { a: 1 }, 'u');
    version.status = 'published'; // simulate a later-milestone workflow transition
    await expect(service.updateDraftVersion(doc.id, version.id, { a: 2 })).rejects.toThrow(
      /immutable/,
    );
  });
});

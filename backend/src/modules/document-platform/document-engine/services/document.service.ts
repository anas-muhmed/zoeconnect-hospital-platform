import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../entities/document.entity';
import { DocumentVersionEntity, DocumentVersionStatus } from '../entities/document-version.entity';

export interface CreateDocumentInput {
  documentTypeId: string;
  name: string;
  category: string;
  isMultiBranch?: boolean;
  createdBy: string;
}

/**
 * DocumentService — generic Document Engine CRUD + version creation (ADR-001,
 * ADR-002). Milestone 1 scope: create a document, create/read/list draft
 * versions. Milestone 4 adds `transitionVersionStatus` as a deliberately
 * minimal, single-step, no-approval-chain status setter — just enough to
 * reach 'published' so Milestone 4's Runtime has something to fill against.
 * The Configurable Workflow Engine (Milestone 5, ADR-008) owns real
 * multi-step approval chains; when it lands, it should call this same
 * low-level primitive after its own gating logic runs, not duplicate it.
 *
 * Follows the existing ZoeConnect convention: direct @InjectRepository(Entity), no
 * repository-wrapper abstraction (see Phase 1 conventions audit).
 */
@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    @InjectRepository(DocumentVersionEntity)
    private readonly versionRepo: Repository<DocumentVersionEntity>,
  ) {}

  async createDocument(input: CreateDocumentInput): Promise<DocumentEntity> {
    const entity = this.documentRepo.create({
      documentTypeId: input.documentTypeId,
      name: input.name,
      category: input.category,
      isMultiBranch: input.isMultiBranch ?? true,
      createdBy: input.createdBy,
    });
    return this.documentRepo.save(entity);
  }

  async getDocument(id: string): Promise<DocumentEntity> {
    const doc = await this.documentRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  async listDocuments(documentTypeId?: string, limit: number = 50, offset: number = 0): Promise<{ items: DocumentEntity[], total: number }> {
    const where = documentTypeId ? { documentTypeId } : {};
    const [items, total] = await this.documentRepo.findAndCount({
      where,
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' }
    });
    return { items, total };
  }

  /**
   * Creates a new draft version. Version numbers increment per-document,
   * starting at 1. No workflow/status transition logic beyond the initial
   * 'draft' state — see class docstring.
   */
  async createDraftVersion(
    documentId: string,
    payload: Record<string, unknown>,
    authorId: string,
  ): Promise<DocumentVersionEntity> {
    await this.getDocument(documentId); // throws NotFoundException if missing

    const latest = await this.versionRepo.findOne({
      where: { documentId },
      order: { versionNo: 'DESC' },
    });
    const nextVersionNo = (latest?.versionNo ?? 0) + 1;

    const version = this.versionRepo.create({
      documentId,
      versionNo: nextVersionNo,
      status: 'draft',
      payload,
      authorId,
    });
    return this.versionRepo.save(version);
  }

  async getVersion(documentId: string, versionId: string): Promise<DocumentVersionEntity> {
    const version = await this.versionRepo.findOne({ where: { id: versionId, documentId } });
    if (!version) throw new NotFoundException(`Version ${versionId} not found for document ${documentId}`);
    return version;
  }

  /**
   * Fetches a version purely by its own id, with no documentId cross-check
   * (Milestone 4 — DocumentInstanceEntity only stores documentVersionId, not
   * a denormalized documentId, so Runtime code that starts from an instance
   * needs this rather than `getVersion`, which requires both ids). Safe
   * because version ids are globally unique UUIDs, not scoped per-document.
   */
  async getVersionById(versionId: string): Promise<DocumentVersionEntity> {
    const version = await this.versionRepo.findOne({ where: { id: versionId } });
    if (!version) throw new NotFoundException(`Version ${versionId} not found`);
    return version;
  }

  async listVersions(documentId: string): Promise<DocumentVersionEntity[]> {
    return this.versionRepo.find({ where: { documentId }, order: { versionNo: 'ASC' } });
  }

  /**
   * Updates an existing draft version's payload in place. Only permitted while
   * status is 'draft' — once a version moves past draft, it becomes
   * immutable per ADR-001/Phase 1 §4.5, and edits must fork a new version
   * instead.
   */
  async updateDraftVersion(
    documentId: string,
    versionId: string,
    payload: Record<string, unknown>,
  ): Promise<DocumentVersionEntity> {
    const version = await this.getVersion(documentId, versionId);
    if (version.status !== 'draft') {
      throw new ConflictException(
        `Version ${versionId} is not a draft (status: ${version.status}); it is immutable per ADR-001.`,
      );
    }
    version.payload = payload;
    return this.versionRepo.save(version);
  }

  /**
   * Milestone 4 stopgap (see class docstring): sets a version's status
   * directly, with no approval-chain gating. When transitioning to
   * 'published', also stamps the parent document's currentPublishedVersionId
   * so Runtime consumers can find "the" published schema for a document.
   */
  async transitionVersionStatus(
    documentId: string,
    versionId: string,
    nextStatus: DocumentVersionStatus,
  ): Promise<DocumentVersionEntity> {
    const version = await this.getVersion(documentId, versionId);
    version.status = nextStatus;
    const saved = await this.versionRepo.save(version);

    if (nextStatus === 'published') {
      const doc = await this.getDocument(documentId);
      doc.currentPublishedVersionId = versionId;
      await this.documentRepo.save(doc);
    }

    return saved;
  }

  /** Fetches the document's currently published version, if any (Milestone 4 Runtime). */
  async getPublishedVersion(documentId: string): Promise<DocumentVersionEntity> {
    const doc = await this.getDocument(documentId);
    if (!doc.currentPublishedVersionId) {
      throw new NotFoundException(`Document ${documentId} has no published version`);
    }
    return this.getVersion(documentId, doc.currentPublishedVersionId);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentSnapshotEntity } from '../entities/document-snapshot.entity';
import type { FormSchema } from '@hdsp/form-schema';

@Injectable()
export class DocumentSnapshotService {
  constructor(
    @InjectRepository(DocumentSnapshotEntity)
    private readonly snapshotRepo: Repository<DocumentSnapshotEntity>,
  ) {}

  async createSnapshot(
    instanceId: string,
    schemaPayload: FormSchema,
    contextPayload: Record<string, unknown>,
    answersPayload: Record<string, unknown>,
    metadata: {
      templateVersionId?: string;
      templateVersionString?: string;
      documentRevision?: number;
      createdBy?: string;
      executionContextVersion?: string;
      ruleEngineVersion?: string;
      pluginVersions?: Record<string, string>;
      snapshotReason?: string;
    } = {}
  ): Promise<DocumentSnapshotEntity> {
    const snapshot = this.snapshotRepo.create({
      instanceId,
      schemaPayload: schemaPayload as unknown as Record<string, unknown>,
      contextPayload,
      answersPayload,
      ...metadata,
    });
    return this.snapshotRepo.save(snapshot);
  }

  async getSnapshotForInstance(instanceId: string): Promise<DocumentSnapshotEntity | null> {
    return this.snapshotRepo.findOne({
      where: { instanceId },
      order: { createdAt: 'DESC' },
    });
  }
}

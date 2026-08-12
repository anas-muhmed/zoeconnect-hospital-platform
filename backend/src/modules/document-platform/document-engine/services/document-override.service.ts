import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { DocumentOverrideEntity } from '../entities/document-override.entity';
import { DocumentOverrideVersionEntity } from '../entities/document-override-version.entity';
// @ts-ignore - explicitly type-only so it doesn't crash runtime or build if missing
import type { Operation } from 'fast-json-patch';

@Injectable()
export class DocumentOverrideService {
  constructor(
    @InjectRepository(DocumentOverrideEntity)
    private readonly overrideRepo: Repository<DocumentOverrideEntity>,
    @InjectRepository(DocumentOverrideVersionEntity)
    private readonly overrideVersionRepo: Repository<DocumentOverrideVersionEntity>,
  ) {}

  async saveOverride(
    documentId: string,
    scope: 'branch' | 'department',
    branchId: string | null,
    departmentCode: string | null,
    patches: Operation[],
    authorId: string,
  ): Promise<DocumentOverrideVersionEntity> {
    let override = await this.overrideRepo.findOne({
      where: { documentId, scope, branchId: branchId || IsNull(), departmentCode: departmentCode || IsNull() },
    });

    if (!override) {
      override = this.overrideRepo.create({
        documentId,
        scope,
        branchId,
        departmentCode,
      });
      override = await this.overrideRepo.save(override);
    }

    const lastVersion = await this.overrideVersionRepo.findOne({
      where: { overrideId: override.id },
      order: { versionNo: 'DESC' },
    });

    const nextVersionNo = lastVersion ? lastVersion.versionNo + 1 : 1;

    const version = this.overrideVersionRepo.create({
      overrideId: override.id,
      versionNo: nextVersionNo,
      patch: patches,
      status: 'draft',
    });

    return this.overrideVersionRepo.save(version);
  }

  async getLatestOverride(
    documentId: string,
    scope: 'branch' | 'department',
    branchId: string | null,
    departmentCode: string | null,
  ): Promise<DocumentOverrideVersionEntity | null> {
    const override = await this.overrideRepo.findOne({
      where: { documentId, scope, branchId: branchId || IsNull(), departmentCode: departmentCode || IsNull() },
    });

    if (!override) return null;

    return this.overrideVersionRepo.findOne({
      where: { overrideId: override.id },
      order: { versionNo: 'DESC' },
    });
  }
}

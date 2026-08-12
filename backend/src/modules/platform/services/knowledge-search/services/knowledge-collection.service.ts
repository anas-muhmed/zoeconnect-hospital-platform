import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeCollectionEntity } from '../entities/knowledge-collection.entity';

@Injectable()
export class KnowledgeCollectionService {
  private readonly logger = new Logger(KnowledgeCollectionService.name);
  private collections = new Map<string, KnowledgeCollectionEntity>();

  createCollection(collection: KnowledgeCollectionEntity): void {
    this.collections.set(collection.id, collection);
    this.logger.log(`Created Knowledge Collection: ${collection.name} [${collection.category}]`);
  }

  getCollectionsByTenant(tenantId: string): KnowledgeCollectionEntity[] {
    return Array.from(this.collections.values()).filter(c => !c.tenantId || c.tenantId === tenantId);
  }
}

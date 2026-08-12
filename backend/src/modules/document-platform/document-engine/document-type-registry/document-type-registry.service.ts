import { Injectable, Logger } from '@nestjs/common';
import type { DocumentTypeDefinition } from './document-type.interface';

/**
 * In-memory registry of DocumentTypeDefinitions (ADR-002). Consumer modules call
 * register() from their module's onModuleInit — see Phase 4A §9 for the intended
 * dynamic-forms registration shape once it lands in a later milestone.
 */
@Injectable()
export class DocumentTypeRegistryService {
  private readonly logger = new Logger(DocumentTypeRegistryService.name);
  private readonly types = new Map<string, DocumentTypeDefinition>();

  register(definition: DocumentTypeDefinition): void {
    if (this.types.has(definition.id)) {
      throw new Error(
        `DocumentTypeRegistryService: a document type with id "${definition.id}" is already registered.`,
      );
    }
    this.types.set(definition.id, definition);
    this.logger.log(`Registered document type "${definition.id}"`);
  }

  get(id: string): DocumentTypeDefinition | undefined {
    return this.types.get(id);
  }

  has(id: string): boolean {
    return this.types.has(id);
  }

  list(): DocumentTypeDefinition[] {
    return Array.from(this.types.values());
  }
}

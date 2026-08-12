import { Injectable, Logger } from '@nestjs/common';
import { ISearchProvider } from '../interfaces/search-provider.interface';

export enum KnowledgeCategory {
  STRUCTURED = 'STRUCTURED',     // Patient, Orders, Vitals, Labs
  UNSTRUCTURED = 'UNSTRUCTURED', // Policies, Manuals, Guidelines, Protocols, SOPs
}

@Injectable()
export class KnowledgePlatformService {
  private readonly logger = new Logger(KnowledgePlatformService.name);
  
  // In a real implementation, this would be injected via a token or factory
  private searchProvider: ISearchProvider | null = null;

  registerSearchProvider(provider: ISearchProvider) {
    this.searchProvider = provider;
    this.logger.log(`Registered Search Provider: ${provider.name}`);
  }

  /**
   * Retrieves relevant knowledge for RAG (Retrieval-Augmented Generation)
   */
  async retrieveKnowledge(query: string, category?: KnowledgeCategory, limit: number = 5): Promise<any[]> {
    if (!this.searchProvider) {
      this.logger.warn('No search provider registered. Returning empty knowledge context.');
      return [];
    }

    const index = category === KnowledgeCategory.STRUCTURED ? 'structured_knowledge' : 'unstructured_knowledge';
    
    // For V1 scaffolding, we assume a simple text search. 
    // An AI platform with embeddings capability would use hybridSearch.
    const results = await this.searchProvider.search(index, query, { limit });
    
    return results.map(r => r.document);
  }
}

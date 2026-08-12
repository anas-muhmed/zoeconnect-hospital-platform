export interface SearchQueryOptions {
  limit?: number;
  offset?: number;
  filters?: Record<string, any>;
  minScore?: number;
}

export interface SearchResult<T> {
  id: string;
  score: number;
  document: T;
  metadata: Record<string, any>;
}

export interface ISearchProvider {
  readonly id: string;
  readonly name: string;
  
  /**
   * Performs a full-text search.
   */
  search(index: string, query: string, options?: SearchQueryOptions): Promise<SearchResult<any>[]>;

  /**
   * Performs a vector/semantic search using a pre-computed embedding.
   */
  vectorSearch(index: string, vector: number[], options?: SearchQueryOptions): Promise<SearchResult<any>[]>;

  /**
   * Performs a hybrid search combining full-text and vector search.
   */
  hybridSearch(index: string, query: string, vector: number[], options?: SearchQueryOptions): Promise<SearchResult<any>[]>;
  
  /**
   * Indexes a document.
   */
  indexDocument(index: string, documentId: string, document: any, metadata?: Record<string, any>, vector?: number[]): Promise<void>;
}

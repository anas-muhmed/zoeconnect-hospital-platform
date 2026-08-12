export interface IKnowledgeConnector {
  sourceId: string;
  fetchDocuments(): AsyncGenerator<any>;
}

export interface IKnowledgeIngestion {
  ingest(document: any): Promise<any>;
}

export interface IKnowledgeChunker {
  chunk(document: any): Promise<any[]>;
}

export interface IKnowledgeEmbedder {
  embed(chunks: any[]): Promise<any[]>;
}

export interface IKnowledgeIndex {
  index(embeddedChunks: any[]): Promise<void>;
  search(queryVector: any, filters: any): Promise<any[]>;
}

export interface IKnowledgeRetrieval {
  retrieve(query: string, filters: any): Promise<any[]>;
}

export interface IKnowledgeCitation {
  formatCitation(retrievedDocuments: any[]): any;
}

export interface IKnowledgeGovernance {
  checkAccess(document: any, context: any): Promise<boolean>;
}

// Full Pipeline Definition
export interface IKnowledgePipeline {
  connector: IKnowledgeConnector;
  ingestion: IKnowledgeIngestion;
  chunker: IKnowledgeChunker;
  embedder: IKnowledgeEmbedder;
  index: IKnowledgeIndex;
  retrieval: IKnowledgeRetrieval;
  citation: IKnowledgeCitation;
  governance: IKnowledgeGovernance;
}

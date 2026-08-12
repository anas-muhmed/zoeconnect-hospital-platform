export enum AiCapabilityType {
  CHAT = 'CHAT',
  COMPLETION = 'COMPLETION',
  STRUCTURED_OUTPUT = 'STRUCTURED_OUTPUT',
  VISION = 'VISION',
  OCR = 'OCR',
  EMBEDDINGS = 'EMBEDDINGS',
  RERANKING = 'RERANKING',
  TRANSLATION = 'TRANSLATION',
  CLASSIFICATION = 'CLASSIFICATION',
  SUMMARIZATION = 'SUMMARIZATION',
  ENTITY_EXTRACTION = 'ENTITY_EXTRACTION',
  TEXT_TO_SPEECH = 'TEXT_TO_SPEECH',
  SPEECH_TO_TEXT = 'SPEECH_TO_TEXT',
  IMAGE_GENERATION = 'IMAGE_GENERATION',
  IMAGE_UNDERSTANDING = 'IMAGE_UNDERSTANDING',
  AGENT = 'AGENT',
}

export interface IAiCapability {
  readonly type: AiCapabilityType;
  readonly name: string;
  readonly description: string;
}

export interface IChatCapability extends IAiCapability {
  readonly type: AiCapabilityType.CHAT;
  executeChat(messages: any[], options?: any): Promise<any>;
}

export interface IStructuredOutputCapability extends IAiCapability {
  readonly type: AiCapabilityType.STRUCTURED_OUTPUT;
  executeStructured(prompt: string, schema: any, options?: any): Promise<any>;
}

// Additional capabilities will be defined as needed

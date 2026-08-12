export enum AiStreamEventType {
  START = 'START',
  TOKEN = 'TOKEN',
  STRUCTURED_CHUNK = 'STRUCTURED_CHUNK',
  PROGRESS = 'PROGRESS',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export interface AiStreamEvent {
  type: AiStreamEventType;
  payload?: any;
  error?: Error;
}

export interface IAiStreamHandler {
  onEvent(event: AiStreamEvent): void;
}

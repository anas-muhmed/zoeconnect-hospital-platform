import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export enum AiSessionType {
  CONVERSATION = 'CONVERSATION',
  EXECUTION = 'EXECUTION',
}

export interface AiSession {
  sessionId: string;
  type: AiSessionType;
  history: any[];
  metadata: Record<string, any>;
  accumulatedCost: number;
  totalTokens: number;
}

@Injectable()
export class AiSessionService {
  private readonly logger = new Logger(AiSessionService.name);
  
  // In-memory store for V1 scaffolding. Will use DB or Redis later
  private sessions = new Map<string, AiSession>();

  createSession(type: AiSessionType, metadata: Record<string, any> = {}): string {
    const sessionId = uuidv4();
    this.sessions.set(sessionId, {
      sessionId,
      type,
      history: [],
      metadata,
      accumulatedCost: 0,
      totalTokens: 0,
    });
    this.logger.log(`Created AI ${type} Session: ${sessionId}`);
    return sessionId;
  }

  getSession(sessionId: string): AiSession | null {
    return this.sessions.get(sessionId) || null;
  }

  updateSessionTokens(sessionId: string, tokens: number, cost: number) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.totalTokens += tokens;
      session.accumulatedCost += cost;
    }
  }

  appendHistory(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.history.push(message);
    }
  }
}

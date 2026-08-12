import { BadRequestException } from '@nestjs/common';
import { DocumentInstanceStatus } from '../entities/document-instance.entity';

/**
 * Phase 2.6: Platform Hardening
 * Declarative state transitions for the Document execution lifecycle.
 * Workflow Engine (Phase 3) will orchestrate these transitions, 
 * but this state machine ensures they are strictly validated.
 */

const ALLOWED_TRANSITIONS: Record<DocumentInstanceStatus, DocumentInstanceStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['completed', 'archived'],
  completed: ['under_review', 'approved', 'in_progress'], // in_progress if rejected
  under_review: ['approved', 'completed'], // completed if returned for revision
  approved: ['locked'],
  locked: ['archived'],
  archived: [],
};

export class DocumentLifecycleStateMachine {
  
  /**
   * Validates if a transition from `currentState` to `nextState` is allowed.
   * Throws a BadRequestException if invalid.
   */
  static validateTransition(currentState: DocumentInstanceStatus, nextState: DocumentInstanceStatus): void {
    if (currentState === nextState) {
      return; // No transition
    }

    const allowed = ALLOWED_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(nextState)) {
      throw new BadRequestException(`Invalid state transition from '${currentState}' to '${nextState}'`);
    }
  }

  /**
   * Checks if a transition is allowed without throwing an error.
   */
  static canTransition(currentState: DocumentInstanceStatus, nextState: DocumentInstanceStatus): boolean {
    if (currentState === nextState) return true;
    const allowed = ALLOWED_TRANSITIONS[currentState];
    return allowed ? allowed.includes(nextState) : false;
  }
}

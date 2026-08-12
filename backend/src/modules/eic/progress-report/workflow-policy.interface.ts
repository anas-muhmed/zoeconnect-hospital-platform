/**
 * Generic strategy interface for domain workflow state machines.
 * Each implementation encodes the allowed transitions for a specific workflow.
 */
export interface WorkflowPolicy<TStatus extends string, TEvent extends string> {
  /**
   * Returns true if transitioning from `currentStatus` on `event` is permitted.
   */
  canTransition(currentStatus: TStatus, event: TEvent): boolean;

  /**
   * Returns the next status after the transition.
   * Must only be called after confirming canTransition returns true.
   */
  nextState(currentStatus: TStatus, event: TEvent): TStatus;

  /**
   * Human-readable message explaining why a transition is blocked.
   * Used to populate BadRequestException messages.
   */
  guardMessage(currentStatus: TStatus, event: TEvent): string;
}

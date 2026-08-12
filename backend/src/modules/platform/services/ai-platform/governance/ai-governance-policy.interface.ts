export interface PolicyConfiguration {
  enabled: boolean;
  priority: number; // Order of execution
  failOpen: boolean; // If true, errors in the policy do not fail the request
  parameters?: Record<string, any>;
}

export interface IAiGovernancePolicy {
  readonly id: string;
  readonly name: string;
  
  /**
   * Executes the policy against the current execution request and context.
   * Modifies the context or request in-place, or throws an exception if the policy fails.
   */
  evaluate(request: any, context: any, config: PolicyConfiguration): Promise<void>;
}

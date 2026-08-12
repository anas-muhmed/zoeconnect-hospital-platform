import type { RuleExpression } from '@hdsp/form-schema';

export interface WorkflowDefinition {
  version: string;
  name: string;
  description?: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

export interface WorkflowState {
  id: string; // e.g. 'draft', 'review', 'approved'
  name: string; // Human readable name
  isTerminal?: boolean; // True if this is an end state
}

export interface WorkflowTransition {
  from: string;
  action: string; // e.g. 'submit', 'approve', 'request_revision'
  to: string;
  
  label?: string; // Human readable label for the UI button
  
  // Assignment rules for the tasks generated at the target state. 
  // Array supports parallel approvals (e.g., Doctor Review AND Nursing Review simultaneously).
  assignTo?: WorkflowAssignment | WorkflowAssignment[];
  
  // Optional condition using Rule Engine logic
  // If multiple transitions share the same 'from' and 'action', they are evaluated in order.
  condition?: RuleExpression;
}

export interface WorkflowAssignment {
  // Hierarchical model as requested: Expression -> Role -> Department -> Team -> Specific User
  expression?: RuleExpression; // Using RuleExpression to dynamically evaluate assignments 
  roles?: string[]; 
  departments?: string[]; 
  teams?: string[];
  userIds?: string[]; 
  allowClaiming?: boolean; // Whether the task can be claimed from a group pool
}

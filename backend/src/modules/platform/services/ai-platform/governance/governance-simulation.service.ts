import { Injectable, Logger } from '@nestjs/common';
import { AiExecutionRequest } from '../interfaces/ai-execution.interface';

export interface GovernanceSimulationNode {
  nodeName: string;
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'SKIPPED';
  details?: string;
  durationMs?: number;
}

export interface GovernanceExecutionGraph {
  request: Partial<AiExecutionRequest>;
  nodes: GovernanceSimulationNode[];
  finalVerdict: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

@Injectable()
export class GovernanceSimulationService {
  private readonly logger = new Logger(GovernanceSimulationService.name);

  /**
   * Runs a dry-run of the governance pipeline, generating a trace graph
   * of exactly which policies would execute and what the outcome would be,
   * without actually invoking an AI provider.
   */
  async simulateRequest(request: AiExecutionRequest): Promise<GovernanceExecutionGraph> {
    this.logger.debug('Running Governance Simulation...');
    
    // Scaffold: Return a mock graph representing the execution trace
    const graph: GovernanceExecutionGraph = {
      request: {
        capability: request.capability,
        operatingMode: request.operatingMode,
      },
      nodes: [
        { nodeName: 'RequestClassification', status: 'PASSED', details: 'Classified as INTERNAL' },
        { nodeName: 'AuthorizationPolicy', status: 'PASSED' },
        { nodeName: 'CapabilityPolicy', status: 'PASSED', details: `Capability ${request.capability} allowed` },
        { nodeName: 'PiiPhiPolicy', status: 'PASSED', details: 'No PHI detected' },
        { nodeName: 'ProviderSelectionPolicy', status: 'PASSED', details: 'Selected google-gemini' },
        { nodeName: 'BudgetPolicy', status: 'PASSED' },
        { nodeName: 'OutputValidationPolicy', status: 'SKIPPED', details: 'Dry-run mode' },
        { nodeName: 'AuditPolicy', status: 'SKIPPED', details: 'Dry-run mode' }
      ],
      finalVerdict: 'APPROVED'
    };

    return graph;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';

export interface AiFeatureContext {
  hospitalId?: string;
  departmentId?: string;
  documentType?: string;
  workflowId?: string;
}

@Injectable()
export class AiFeatureFlagsService {
  private readonly logger = new Logger(AiFeatureFlagsService.name);

  async isCapabilityEnabled(capability: AiCapabilityType, context: AiFeatureContext): Promise<boolean> {
    this.logger.debug(`Checking feature flags for capability: ${capability}`);
    
    // Scaffold: Check flags hierarchically.
    // Hospital -> Department -> Document Type -> Workflow -> Capability
    
    // For now, always enabled in scaffold
    return true;
  }
}

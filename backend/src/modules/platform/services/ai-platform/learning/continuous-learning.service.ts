import { Injectable, Logger } from '@nestjs/common';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';

export interface AiFeedbackSubmission {
  auditId: string;
  capability: AiCapabilityType;
  action: 'ACCEPTED' | 'REJECTED' | 'EDITED';
  originalOutput: any;
  finalOutput?: any;
  userComments?: string;
}

@Injectable()
export class ContinuousLearningService {
  private readonly logger = new Logger(ContinuousLearningService.name);

  async collectFeedback(submission: AiFeedbackSubmission): Promise<void> {
    this.logger.log(`Collected AI feedback for audit [${submission.auditId}]: ${submission.action}`);
    
    // Store in a feedback data lake for asynchronous evaluation
    // Crucially: Does NOT trigger live model retraining. Used purely for:
    // 1. Prompt engineering evaluation
    // 2. Provider routing accuracy
    // 3. Clinical governance review
  }
}

import { Injectable, Logger } from '@nestjs/common';

export interface IGovernanceMiddleware {
  readonly name: string;
  readonly order: number; // For pipeline ordering
  process(context: any, next: () => Promise<any>): Promise<any>;
}

/**
 * The GovernancePipeline intercepts every AI request.
 * Middleware executes in the order of registration (sorted by order).
 * Flow:
 * Authorization -> Capability Validation -> Context Builder -> Data Classification
 * -> PII / PHI Policy -> Prompt Hydration -> Prompt Validation -> Budget
 * -> Provider Selection -> Execution -> Output Validation -> Clinical Safety Validation
 * -> Human Approval Policy -> Audit -> Metrics
 */
@Injectable()
export class GovernancePipeline {
  private readonly logger = new Logger(GovernancePipeline.name);
  private middlewares: IGovernanceMiddleware[] = [];

  registerMiddleware(middleware: IGovernanceMiddleware) {
    this.middlewares.push(middleware);
    this.middlewares.sort((a, b) => a.order - b.order);
    this.logger.log(`Registered Governance Middleware: ${middleware.name} (Order: ${middleware.order})`);
  }

  async execute(requestContext: any, finalAction: () => Promise<any>): Promise<any> {
    this.logger.debug('Executing Governance Pipeline...');
    
    // Build the middleware chain
    let index = -1;
    
    const dispatch = async (i: number): Promise<any> => {
      if (i <= index) {
        throw new Error('next() called multiple times in governance middleware');
      }
      index = i;
      let mw = this.middlewares[i];
      if (i === this.middlewares.length) {
        // End of pipeline, execute the actual LLM call
        return finalAction();
      }
      try {
        return await mw.process(requestContext, dispatch.bind(null, i + 1));
      } catch (err) {
        this.logger.error(`Governance Middleware ${mw.name} rejected the request or failed.`, err);
        throw err;
      }
    };

    return dispatch(0);
  }
}

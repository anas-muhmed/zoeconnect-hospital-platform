import { Injectable, Logger } from '@nestjs/common';

export interface ContextContribution {
  source: string;
  data: Record<string, any>;
}

export interface AiContext {
  mergedData: Record<string, any>;
  contributions: ContextContribution[];
}

export interface IContextContributor {
  readonly name: string;
  readonly order: number; // For layering: lower order runs first
  contribute(params: any): Promise<ContextContribution | null>;
}

@Injectable()
export class AiContextBuilder {
  private readonly logger = new Logger(AiContextBuilder.name);
  private contributors: IContextContributor[] = [];

  registerContributor(contributor: IContextContributor) {
    this.contributors.push(contributor);
    // Sort contributors by order ascending
    this.contributors.sort((a, b) => a.order - b.order);
    this.logger.log(`Registered Context Contributor: ${contributor.name} (Order: ${contributor.order})`);
  }

  async buildContext(params: any): Promise<AiContext> {
    const aiContext: AiContext = {
      mergedData: {},
      contributions: [],
    };

    this.logger.debug('Building AI Context via contributors...');
    for (const contributor of this.contributors) {
      try {
        const contribution = await contributor.contribute(params);
        if (contribution) {
          aiContext.contributions.push(contribution);
          // Immutable merge, where later contributors can NOT overwrite existing keys
          // Wait, if lower order runs first, we want them to take precedence or be overridden?
          // The instruction: "Otherwise two contributors can overwrite fields." implies we want strict non-overwrite or namespaced merging.
          // Let's namespace it by source, or throw if a key already exists. For simplicity, we merge only new keys.
          for (const key of Object.keys(contribution.data)) {
            if (aiContext.mergedData[key] !== undefined) {
              this.logger.warn(`Context key conflict: '${key}' from ${contribution.source} is already defined. Ignoring.`);
            } else {
              aiContext.mergedData[key] = contribution.data[key];
            }
          }
          this.logger.debug(`Contributor ${contributor.name} added keys: ${Object.keys(contribution.data).join(', ')}`);
        }
      } catch (err) {
        this.logger.error(`Error in Context Contributor ${contributor.name}`, err);
        throw err;
      }
    }

    // Freeze to enforce immutability
    Object.freeze(aiContext.mergedData);
    Object.freeze(aiContext.contributions);
    return Object.freeze(aiContext);
  }
}

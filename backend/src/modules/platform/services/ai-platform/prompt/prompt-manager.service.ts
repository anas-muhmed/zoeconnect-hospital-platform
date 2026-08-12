import { Injectable, Logger } from '@nestjs/common';

export interface PromptVersion {
  id: string;
  name: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
  template: string;
  variables: string[];
  expectedSchema?: any;
  supportedCapabilities: string[];
  temperature?: number;
  maxTokens?: number;
  tags: string[];
  owner: string;
}

@Injectable()
export class PromptManagerService {
  private readonly logger = new Logger(PromptManagerService.name);

  // In memory store for V1 scaffolding. Will be replaced by TypeORM repository
  // Maps prompt name to an array of versions (immutable history)
  private prompts = new Map<string, PromptVersion[]>();

  async getPrompt(name: string, version?: number): Promise<PromptVersion> {
    this.logger.debug(`Fetching prompt ${name} (version: ${version || 'latest published'})`);
    
    const versions = this.prompts.get(name);
    if (!versions || versions.length === 0) {
      // Mock fallback for scaffold
      return {
        id: 'p-1',
        name,
        version: version || 1,
        status: 'PUBLISHED',
        template: 'You are a helpful medical assistant. Extract the following from the text: {{text}}',
        variables: ['text'],
        supportedCapabilities: ['STRUCTURED_OUTPUT'],
        tags: ['clinical', 'extraction'],
        owner: 'system',
      };
    }

    if (version !== undefined) {
      const specific = versions.find(v => v.version === version);
      if (!specific) throw new Error(`Prompt ${name} version ${version} not found`);
      return specific;
    }

    // Return the latest PUBLISHED version
    const published = versions.filter(v => v.status === 'PUBLISHED').sort((a, b) => b.version - a.version);
    if (published.length === 0) throw new Error(`No published version found for prompt ${name}`);
    return published[0];
  }

  async publishPrompt(name: string, newTemplate: string, variables: string[]): Promise<PromptVersion> {
    const versions = this.prompts.get(name) || [];
    const latestVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) : 0;
    const nextVersion = latestVersion + 1;

    // Optional: Validate variables and schema here before publishing

    const newPrompt: PromptVersion = {
      id: `p-${Date.now()}`,
      name,
      version: nextVersion,
      status: 'PUBLISHED',
      template: newTemplate,
      variables,
      supportedCapabilities: ['CHAT'], // Default
      tags: [],
      owner: 'system',
    };

    // If there is an existing published version, we might want to keep it PUBLISHED,
    // or deprecate the old one. Let's deprecate old ones.
    for (const v of versions) {
      if (v.status === 'PUBLISHED') v.status = 'DEPRECATED';
    }

    versions.push(newPrompt);
    this.prompts.set(name, versions);
    
    this.logger.log(`Published new immutable version ${nextVersion} for prompt ${name}`);
    return newPrompt;
  }

  async rollback(name: string, targetVersion: number): Promise<PromptVersion> {
    const versions = this.prompts.get(name);
    if (!versions) throw new Error(`Prompt ${name} not found`);

    const target = versions.find(v => v.version === targetVersion);
    if (!target) throw new Error(`Version ${targetVersion} not found for prompt ${name}`);

    // Create a new version that is a copy of the target version
    return this.publishPrompt(name, target.template, target.variables);
  }

  async hydratePrompt(prompt: PromptVersion, context: Record<string, any>): Promise<string> {
    let hydrated = prompt.template;
    for (const variable of prompt.variables) {
      const value = context[variable];
      if (value !== undefined) {
        // Simple string replacement for scaffold. 
        // In a real app, use Handlebars or Liquid.
        hydrated = hydrated.replace(new RegExp(`{{${variable}}}`, 'g'), String(value));
      }
    }
    return hydrated;
  }
}

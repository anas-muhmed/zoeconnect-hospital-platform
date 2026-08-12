import { Injectable, Logger } from '@nestjs/common';
import { PromptTemplateEntity } from '../entities/prompt-template.entity';

@Injectable()
export class PromptOpsRepository {
  private readonly logger = new Logger(PromptOpsRepository.name);
  private templates = new Map<string, PromptTemplateEntity>();

  save(template: PromptTemplateEntity): void {
    this.templates.set(template.id, template);
    this.logger.log(`Saved Prompt Template [${template.id}] - v${template.semanticVersion} - Status: ${template.status}`);
  }

  findById(id: string): PromptTemplateEntity | undefined {
    return this.templates.get(id);
  }

  findPublished(name: string): PromptTemplateEntity | undefined {
    return Array.from(this.templates.values()).find(t => t.name === name && t.status === 'PUBLISHED');
  }

  // Version diff, rollback, evaluation history, and routing logic would go here
}

import { Injectable, Logger } from '@nestjs/common';
import { ToolRegistry } from './tool-registry';

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(private readonly registry: ToolRegistry) {}

  async executeTool(name: string, args: any): Promise<any> {
    this.logger.debug(`Executing AI tool: ${name}`);
    const tool = this.registry.getTool(name);
    
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      // In a real implementation, we would validate `args` against `tool.schema` here
      const result = await tool.execute(args);
      return result;
    } catch (err) {
      this.logger.error(`Error executing tool ${name}`, err);
      throw err;
    }
  }
}

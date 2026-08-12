import { Injectable, Logger } from '@nestjs/common';

export interface AiTool {
  name: string;
  description: string;
  schema: any; // JSON Schema for the tool parameters
  execute: (args: any) => Promise<any>;
}

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private tools = new Map<string, AiTool>();

  registerTool(tool: AiTool) {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    this.logger.log(`Registered AI Tool: ${tool.name}`);
  }

  getTool(name: string): AiTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): AiTool[] {
    return Array.from(this.tools.values());
  }
}

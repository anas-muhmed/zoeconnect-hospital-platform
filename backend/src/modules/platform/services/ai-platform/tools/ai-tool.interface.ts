export interface ToolDefinition {
  name: string;
  description: string;
  schema: any; // JSON Schema
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  result: any;
  error?: string;
}

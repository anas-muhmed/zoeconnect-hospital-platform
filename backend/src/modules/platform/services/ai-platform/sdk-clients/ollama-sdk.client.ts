import { Injectable, Logger } from '@nestjs/common';
import { AiExecutionRequest, AiExecutionResult } from '../interfaces/ai-execution.interface';
import { AiProviderUnavailableException } from '../exceptions/ai-exceptions';

@Injectable()
export class OllamaSdkClient {
  private readonly logger = new Logger(OllamaSdkClient.name);

  async execute(request: AiExecutionRequest, baseUrl: string): Promise<AiExecutionResult> {
    this.logger.debug(`Executing request via Ollama REST API...`);

    const model = request.options?.model || 'llama3';

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          prompt: request.prompt,
          stream: false,
          format: request.outputSchema ? 'json' : undefined,
          options: {
            temperature: request.options?.temperature || 0.7
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      
      const output = data.response || '';
      let structuredOutput = undefined;

      if (request.outputSchema && output) {
        try {
          structuredOutput = JSON.parse(output);
        } catch (e) {
          // Ignored
        }
      }

      const inputTokens = data.prompt_eval_count || 0;
      const outputTokens = data.eval_count || 0;

      return {
        output,
        structuredOutput,
        finishReason: 'STOP',
        tokenUsage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        latency: data.total_duration ? Math.floor(data.total_duration / 1000000) : 0, 
        model,
        provider: 'ollama',
        safetyFlags: {},
        cost: 0,
      };
    } catch (err: any) {
      this.logger.error(`Ollama REST API Error: ${err.message}`, err);
      throw new AiProviderUnavailableException(`Ollama execution failed: ${err.message}`, { originalError: err });
    }
  }
}

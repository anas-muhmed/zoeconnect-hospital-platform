import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { AiExecutionRequest, AiExecutionResult } from '../interfaces/ai-execution.interface';
import { AiProviderUnavailableException } from '../exceptions/ai-exceptions';

@Injectable()
export class OpenAiSdkClient {
  private readonly logger = new Logger(OpenAiSdkClient.name);

  async execute(request: AiExecutionRequest, apiKey: string, baseURL?: string): Promise<AiExecutionResult> {
    this.logger.debug(`Executing request via OpenAI SDK...`);

    const openai = new OpenAI({ apiKey, baseURL });
    const model = request.options?.model || 'gpt-4o';

    try {
      let output = '';
      let structuredOutput = undefined;

      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: request.prompt }],
        temperature: request.options?.temperature || 0.7,
        response_format: request.outputSchema ? { type: 'json_object' } : undefined,
      });

      output = response.choices[0]?.message?.content || '';
      
      if (request.outputSchema && output) {
        try {
          structuredOutput = JSON.parse(output);
        } catch (e) {
          // Ignored
        }
      }

      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;

      return {
        output,
        structuredOutput,
        finishReason: 'STOP',
        tokenUsage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        latency: 0, 
        model,
        provider: baseURL?.includes('azure') ? 'azure-openai' : 'openai',
        safetyFlags: {},
        cost: 0,
      };
    } catch (err: any) {
      this.logger.error(`OpenAI SDK Error: ${err.message}`, err);
      throw new AiProviderUnavailableException(`OpenAI execution failed: ${err.message}`, { originalError: err });
    }
  }
}

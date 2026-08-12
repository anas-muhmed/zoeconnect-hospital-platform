import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiExecutionRequest, AiExecutionResult } from '../interfaces/ai-execution.interface';
import { AiProviderUnavailableException } from '../exceptions/ai-exceptions';

@Injectable()
export class GeminiSdkClient {
  private readonly logger = new Logger(GeminiSdkClient.name);

  async execute(request: AiExecutionRequest, apiKey: string): Promise<AiExecutionResult> {
    this.logger.debug(`Executing request via Gemini SDK...`);

    const ai = new GoogleGenAI({ apiKey });
    const model = request.options?.model || 'gemini-1.5-pro';

    try {
      let output = '';
      let structuredOutput = undefined;

      const response = await ai.models.generateContent({
        model,
        contents: request.prompt,
        config: {
          temperature: request.options?.temperature || 0.7,
          responseMimeType: request.outputSchema ? 'application/json' : 'text/plain',
          // In a real implementation, map request.outputSchema to responseSchema if supported
        }
      });

      output = response.text || '';
      
      if (request.outputSchema && output) {
        try {
          structuredOutput = JSON.parse(output);
        } catch (e) {
          // Fallback or ignore parse errors here, Governance Pipeline validator will catch it
        }
      }

      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

      return {
        output,
        structuredOutput,
        finishReason: 'STOP',
        tokenUsage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        latency: 0, // Calculated by executor wrapper or pipeline
        model,
        provider: 'google-gemini',
        safetyFlags: {},
        cost: 0, // Calculated by pricing service later
      };
    } catch (err: any) {
      this.logger.error(`Gemini SDK Error: ${err.message}`, err);
      // Map SDK errors to our common exceptions
      throw new AiProviderUnavailableException(`Gemini execution failed: ${err.message}`, { originalError: err });
    }
  }
}

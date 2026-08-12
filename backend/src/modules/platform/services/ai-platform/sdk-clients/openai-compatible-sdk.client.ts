import { Injectable, Logger } from '@nestjs/common';
import { AiExecutionRequest, AiExecutionResult } from '../interfaces/ai-execution.interface';
import { OpenAiSdkClient } from './openai-sdk.client';

@Injectable()
export class OpenAiCompatibleSdkClient {
  private readonly logger = new Logger(OpenAiCompatibleSdkClient.name);

  constructor(private readonly openAiClient: OpenAiSdkClient) {}

  async execute(request: AiExecutionRequest, apiKey: string, baseUrl: string): Promise<AiExecutionResult> {
    this.logger.debug(`Executing request via OpenAI-Compatible Wrapper...`);
    
    return this.openAiClient.execute(request, apiKey, baseUrl);
  }
}

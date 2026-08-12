import { Injectable, Logger } from '@nestjs/common';
import { AiExecutionRequest, AiExecutionResult } from '../interfaces/ai-execution.interface';
import { OpenAiSdkClient } from './openai-sdk.client';

@Injectable()
export class AzureOpenAiSdkClient {
  private readonly logger = new Logger(AzureOpenAiSdkClient.name);

  constructor(private readonly openAiClient: OpenAiSdkClient) {}

  async execute(request: AiExecutionRequest, apiKey: string, endpoint: string, deploymentName: string): Promise<AiExecutionResult> {
    this.logger.debug(`Executing request via Azure OpenAI Wrapper...`);
    
    // Azure OpenAI URLs usually look like:
    // https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}
    const baseURL = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}`;

    // Override the model in options to ensure Azure deployment name is used if required by specific APIs
    const azureRequest = { ...request };
    azureRequest.options = { ...azureRequest.options, model: deploymentName };

    return this.openAiClient.execute(azureRequest, apiKey, baseURL);
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { GeminiSdkClient } from './gemini-sdk.client';
import { AiExecutionRequest } from '../interfaces/ai-execution.interface';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';
import { AiOperatingMode } from '../policy/ai-operating-mode.policy';
import { AiProviderUnavailableException } from '../exceptions/ai-exceptions';

// Mock the GoogleGenAI SDK
jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: jest.fn().mockImplementation(async (args) => {
            if (args.contents === 'FORCE_ERROR') {
              throw new Error('Simulated network timeout');
            }
            if (args.contents === 'FORCE_MALFORMED_JSON') {
              return {
                text: '{ invalid_json: true ',
                usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
              };
            }
            return {
              text: args.config?.responseMimeType === 'application/json' 
                ? '{"success": true}' 
                : 'Standard response',
              usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 20 }
            };
          })
        }
      };
    })
  };
});

describe('GeminiSdkClient (Mocked Integration)', () => {
  let client: GeminiSdkClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeminiSdkClient],
    }).compile();

    client = module.get<GeminiSdkClient>(GeminiSdkClient);
  });

  it('should successfully execute a basic chat request', async () => {
    const request: AiExecutionRequest = {
      capability: AiCapabilityType.CHAT,
      prompt: 'Hello world',
      context: {},
      operatingMode: AiOperatingMode.ASSISTIVE,
    };

    const result = await client.execute(request, 'fake-key');
    expect(result.output).toBe('Standard response');
    expect(result.tokenUsage.totalTokens).toBe(35);
    expect(result.provider).toBe('google-gemini');
  });

  it('should attempt parsing if outputSchema is provided', async () => {
    const request: AiExecutionRequest = {
      capability: AiCapabilityType.STRUCTURED_OUTPUT,
      prompt: 'Give me JSON',
      context: {},
      operatingMode: AiOperatingMode.ADMINISTRATIVE_AUTOMATION,
      outputSchema: { type: 'object' }
    };

    const result = await client.execute(request, 'fake-key');
    expect(result.structuredOutput).toBeDefined();
    expect(result.structuredOutput).toEqual({ success: true });
  });

  it('should gracefully handle malformed JSON from provider without throwing (Validator catches later)', async () => {
    const request: AiExecutionRequest = {
      capability: AiCapabilityType.STRUCTURED_OUTPUT,
      prompt: 'FORCE_MALFORMED_JSON',
      context: {},
      operatingMode: AiOperatingMode.ADMINISTRATIVE_AUTOMATION,
      outputSchema: { type: 'object' }
    };

    const result = await client.execute(request, 'fake-key');
    expect(result.output).toBe('{ invalid_json: true ');
    expect(result.structuredOutput).toBeUndefined();
  });

  it('should throw AiProviderUnavailableException on SDK error', async () => {
    const request: AiExecutionRequest = {
      capability: AiCapabilityType.CHAT,
      prompt: 'FORCE_ERROR',
      context: {},
      operatingMode: AiOperatingMode.ASSISTIVE,
    };

    await expect(client.execute(request, 'fake-key')).rejects.toThrow(AiProviderUnavailableException);
  });
});

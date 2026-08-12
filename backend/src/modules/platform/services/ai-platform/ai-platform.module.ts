import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCapabilityRegistry } from './registries/ai-capability.registry';
import { AiProviderRegistry } from './registries/ai-provider.registry';
import { PromptManagerService } from './prompt/prompt-manager.service';
import { ModelSelectionPolicyEngine } from './policy/model-selection-policy.engine';
import { AiContextBuilder } from './context/ai-context.builder';
import { GovernancePipeline } from './governance/governance.pipeline';
import { AiSessionService } from './session/ai-session.service';
import { GoogleGeminiProvider } from './adapters/google-gemini.provider';
import { OpenAiProvider } from './adapters/openai.provider';
import { AzureOpenAiProvider } from './adapters/azure-openai.provider';
import { OllamaProvider } from './adapters/ollama.provider';
import { OpenAiCompatibleProvider } from './adapters/openai-compatible.provider';

@Module({
  imports: [
    // TypeOrmModule.forFeature([PromptTemplateEntity, AiAuditTrailEntity, AiSessionEntity]),
  ],
  providers: [
    AiCapabilityRegistry,
    AiProviderRegistry,
    PromptManagerService,
    ModelSelectionPolicyEngine,
    AiContextBuilder,
    GovernancePipeline,
    AiSessionService,
    GoogleGeminiProvider,
    OpenAiProvider,
    AzureOpenAiProvider,
    OllamaProvider,
    OpenAiCompatibleProvider,
  ],
  exports: [
    AiCapabilityRegistry,
    AiProviderRegistry,
    PromptManagerService,
    ModelSelectionPolicyEngine,
    AiContextBuilder,
    GovernancePipeline,
    AiSessionService,
  ],
})
export class AiPlatformModule {
  constructor(
    private readonly providerRegistry: AiProviderRegistry,
    private readonly googleGeminiProvider: GoogleGeminiProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly azureOpenAiProvider: AzureOpenAiProvider,
    private readonly ollamaProvider: OllamaProvider,
    private readonly openAiCompatibleProvider: OpenAiCompatibleProvider,
  ) {
    this.providerRegistry.registerProvider(this.googleGeminiProvider);
    this.providerRegistry.registerProvider(this.openAiProvider);
    this.providerRegistry.registerProvider(this.azureOpenAiProvider);
    this.providerRegistry.registerProvider(this.ollamaProvider);
    this.providerRegistry.registerProvider(this.openAiCompatibleProvider);
  }
}

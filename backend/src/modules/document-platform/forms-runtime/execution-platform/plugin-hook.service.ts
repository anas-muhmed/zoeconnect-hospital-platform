import { Injectable } from '@nestjs/common';
import { PluginRegistryService } from '../plugin-registry.service';
import type { FormSchema } from '@hdsp/form-schema';

export interface PluginLifecycleHookContext {
  schema: FormSchema;
  answers: Record<string, unknown>;
  executionContext: Record<string, unknown>;
}

/**
 * PluginHookService
 * Phase 2.5: Runtime Execution Platform
 * Iterates through all registered plugins and invokes runtime hooks.
 */
@Injectable()
export class PluginHookService {
  constructor(private readonly registryService: PluginRegistryService) {}

  async onBeforeSave(context: PluginLifecycleHookContext): Promise<Record<string, unknown>> {
    let mutatedAnswers = { ...context.answers };
    // Future: Iterate through registryService.getLoadedPlugins()
    // and call plugin.onBeforeSave(context) sequentially, allowing them to mutate answers.
    return mutatedAnswers;
  }

  async onAfterSave(context: PluginLifecycleHookContext): Promise<void> {
    // Future: Fire and forget plugin.onAfterSave hooks
  }

  async onBeforeFinalize(context: PluginLifecycleHookContext): Promise<Record<string, unknown>> {
    let mutatedAnswers = { ...context.answers };
    // Future: plugins can inject finalization metadata
    return mutatedAnswers;
  }

  async onAfterFinalize(context: PluginLifecycleHookContext): Promise<void> {
    // Future: e.g. trigger external systems
  }
}

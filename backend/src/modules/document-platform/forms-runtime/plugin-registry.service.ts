import { Injectable } from '@nestjs/common';
import { ComponentRegistry, BASIC_COMPONENT_DEFINITIONS } from '@hdsp/form-schema';
// In the future this might load plugins from the DB or other services

@Injectable()
export class PluginRegistryService {
  private componentRegistry = new ComponentRegistry();

  constructor() {
    // For now, statically register the built-in components (Wave 1).
    // In later phases, this will load from external/dynamic FormBuilderPlugins.
    for (const def of BASIC_COMPONENT_DEFINITIONS) {
      this.componentRegistry.register(def);
    }
  }

  getComponentDefinitions() {
    return this.componentRegistry.list();
  }
}

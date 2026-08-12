import { FormBuilderPlugin, ComponentRegistry } from '@hdsp/form-schema';
import { DesignerPanelPlugin, InspectorTabPlugin, StatusBarItemPlugin } from './ui-plugin.types';

export class PluginRegistry {
  private plugins = new Map<string, FormBuilderPlugin>();
  public componentRegistry = new ComponentRegistry();
  
  public panelPlugins = new Map<string, DesignerPanelPlugin>();
  public inspectorPlugins = new Map<string, InspectorTabPlugin>();
  public statusBarPlugins = new Map<string, StatusBarItemPlugin>();

  register(plugin: FormBuilderPlugin) {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);

    if (plugin.components) {
      for (const component of plugin.components) {
        this.componentRegistry.register(component);
      }
    }
  }
  
  registerPanel(plugin: DesignerPanelPlugin) {
    if (this.panelPlugins.has(plugin.id)) {
      throw new Error(`Panel Plugin ${plugin.id} is already registered.`);
    }
    this.panelPlugins.set(plugin.id, plugin);
  }
  
  registerInspectorTab(plugin: InspectorTabPlugin) {
    if (this.inspectorPlugins.has(plugin.id)) {
      throw new Error(`Inspector Plugin ${plugin.id} is already registered.`);
    }
    this.inspectorPlugins.set(plugin.id, plugin);
  }

  registerStatusBarItem(plugin: StatusBarItemPlugin) {
    if (this.statusBarPlugins.has(plugin.id)) {
      throw new Error(`StatusBar Plugin ${plugin.id} is already registered.`);
    }
    this.statusBarPlugins.set(plugin.id, plugin);
  }

  get(id: string) {
    return this.plugins.get(id);
  }

  list() {
    return Array.from(this.plugins.values());
  }
  
  listPanels(): DesignerPanelPlugin[] {
    return Array.from(this.panelPlugins.values()).sort((a, b) => a.priority - b.priority);
  }

  listInspectorTabs(): InspectorTabPlugin[] {
    return Array.from(this.inspectorPlugins.values()).sort((a, b) => a.priority - b.priority);
  }

  listStatusBarItems(alignment: 'left' | 'right'): StatusBarItemPlugin[] {
    return Array.from(this.statusBarPlugins.values())
      .filter((p) => p.alignment === alignment)
      .sort((a, b) => a.priority - b.priority);
  }
}

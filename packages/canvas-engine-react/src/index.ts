/**
 * @hdsp/canvas-engine-react — thin React binding layer over @hdsp/canvas-engine
 * (ADR-004). React's job is limited to orchestrating chrome; it never owns
 * canvas state directly — see useEngineSelector (reads) and useEngineCommands
 * (writes).
 *
 * MILESTONE 3 ADDITION ("Basic Components"): Wave 1 Designer components
 * (Label/Textbox/TextArea/Checkbox/Radio/Dropdown), registerBasicComponents()
 * to assemble them with @hdsp/form-schema's ComponentDefinitions into a
 * ComponentRegistry (ADR-005), and the Inspector Generator (Phase 5B §2)
 * pulled forward — property panels are generated from propertySchema, never
 * hand-built per component.
 *
 * MILESTONE 2 SCOPE ("Canvas Core"): CanvasEngineHost renders an interactive
 * canvas (pan/zoom/fit, single+marquee selection, drag-move, undo/redo via
 * keyboard/toolbar) against one test-only Rectangle node.
 */
import { CANVAS_ENGINE_VERSION } from '@hdsp/canvas-engine';

export const CANVAS_ENGINE_REACT_VERSION = '0.3.0-milestone3-basic-components';

/** Re-exported purely to prove the dependency wiring compiles end-to-end. */
export function getBoundEngineVersion(): string {
  return CANVAS_ENGINE_VERSION;
}

export { CanvasEngineHost } from './components/canvas-engine-host';
export type { CanvasEngineHostProps } from './components/canvas-engine-host';
export { useEngineSelector } from './hooks/use-engine-selector';
export { useEngineCommands } from './hooks/use-engine-commands';
export { InspectorGenerator } from './components/inspector-generator';
export type { InspectorGeneratorProps } from './components/inspector-generator';
export * from './components/basic/designer-components';
export { registerAllComponents, COMPONENT_DEFAULT_SIZE } from './components/register-components';

export * from './components/asset-manager';
export { LayersPanel } from './components/layers-panel';

export { PluginRegistry } from './plugins/plugin-registry';
export * from './plugins/ui-plugin.types';
export * from './services/designer-selection.service';
export * from './services/command-bus.service';

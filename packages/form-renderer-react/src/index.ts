/**
 * @hdsp/form-renderer-react — the Runtime fill/submit React renderer
 * (ADR-003, Milestone 4 "Runtime"). Depends ONLY on @hdsp/form-schema, never
 * on @hdsp/canvas-engine[-react] — Builder and Renderer are architecturally
 * separate apps that happen to share the same FormSchema/ComponentRegistry
 * data model (ADR-001/ADR-005), not the same engine.
 */
export const FORM_RENDERER_REACT_VERSION = '0.1.0-milestone4-runtime';

export { FormRenderer } from './components/form-renderer';
export type { FormRendererProps } from './components/form-renderer';
export { useFormRuntime } from './hooks/use-form-runtime';
export * from './components/basic/renderer-components';
export { registerAllRuntimeComponents } from './components/register-runtime-components';

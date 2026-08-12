// FormSchema (ADR-001)
export * from './schema/form-schema.types';

// Component Registry (ADR-005)
export * from './registry/component-definition';
export * from './registry/component-registry';

// Plugin SDK (ADR-006 groundwork)
export * from './plugin/plugin.types';
export * from './plugin/plugin-compatibility';

// Wave 1 ("Basic") component metadata (Phase 5B §4, Milestone 3)
export * from './components/basic';

// Wave 2 ("Structural") and Wave 3 ("Complex") component metadata (Milestone 5)
export * from './components/structural';
export * from './components/complex';

// Validation orchestration (Milestone 4, ADR-012 — shared client/server)
export * from './validation/validate-form-instance';

// Six-stage rendering pipeline (Milestone 4, ADR-007)
export * from './rendering-pipeline/pipeline';
export * from './rendering-pipeline/rule-engine';

export * from './components/medical';

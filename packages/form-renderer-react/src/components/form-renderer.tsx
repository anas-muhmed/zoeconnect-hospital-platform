import React from 'react';
import type { FormSchema, ComponentRegistry } from '@hdsp/form-schema';
import { resolveRenderTree } from '@hdsp/form-schema';
import { useFormRuntime } from '../hooks/use-form-runtime';
import { ErrorBoundary } from './error-boundary';

const MemoizedField = React.memo(function MemoizedField({
  component,
  registry,
  value,
  error,
  onChange,
  onBlur,
  renderChild
}: {
  component: import('@hdsp/form-schema').ComponentNode;
  registry: ComponentRegistry;
  value: unknown;
  error: string[] | undefined;
  onChange: (fieldKey: string, value: unknown) => void;
  onBlur: (fieldKey: string) => void;
  renderChild: (child: any) => React.ReactNode;
}) {
  const definition = registry.get(component.type);
  const RendererComponent = definition?.RendererComponent as React.ComponentType<any> | undefined;
  
  if (!RendererComponent) {
    return (
      <div data-testid={`field-${component.fieldKey}`} style={{ fontSize: 12, color: '#999' }}>
        Unregistered type: {component.type}
      </div>
    );
  }

  return (
    <div data-testid={`field-${component.fieldKey}`} style={{ position: 'absolute', left: component.geometry.x, top: component.geometry.y, width: component.geometry.w, height: component.geometry.h }}>
      <ErrorBoundary fallback={<div style={{ color: '#c62828', fontSize: 12 }}>Error rendering {component.type}</div>}>
        <RendererComponent
          fieldKey={component.fieldKey}
          props={component.props}
          value={value}
          error={error}
          onChange={(v: unknown) => onChange(component.fieldKey, v)}
          onBlur={() => onBlur(component.fieldKey)}
        >
          {component.children && component.children.length > 0 && (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              {component.children.map(renderChild)}
            </div>
          )}
        </RendererComponent>
      </ErrorBoundary>
    </div>
  );
});

/**
 * FormRenderer — the Runtime host (Milestone 4, ADR-003/ADR-007). Mounts each
 * page's components via their registered RendererComponent against a
 * resolved schema (resolveRenderTree — currently a pass-through composition
 * of five no-op stages plus this, the real Renderer stage). This is the
 * counterpart to canvas-engine-react's CanvasEngineHost, but structurally
 * much simpler: no scene graph, no command system, no undo/redo — just
 * schema-driven fields and local answer state (useFormRuntime).
 */
export interface FormRendererProps {
  schema: FormSchema;
  registry: ComponentRegistry;
  initialAnswers?: Record<string, unknown>;
  onAnswersChange?: (answers: Record<string, unknown>) => void;
  onSubmit: (answers: Record<string, unknown>) => void | Promise<void>;
  submitLabel?: string;
}

export function FormRenderer({ schema, registry, initialAnswers, onAnswersChange, onSubmit, submitLabel = 'Submit' }: FormRendererProps) {
  const resolvedSchema = resolveRenderTree(schema, {});
  const definitions = registry.list();
  const { answers, setValue, markTouched, touchAll, visibleErrors, validation } = useFormRuntime(
    resolvedSchema,
    definitions,
    initialAnswers,
  );

  const handleChange = React.useCallback((fieldKey: string, value: unknown) => {
    setValue(fieldKey, value);
    onAnswersChange?.({ ...answers, [fieldKey]: value });
  }, [setValue, answers, onAnswersChange]);

  const handleSubmit = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    touchAll();
    if (!validation.valid) return;
    await onSubmit(answers);
  }, [touchAll, validation.valid, onSubmit, answers]);

  const renderComponent = React.useCallback((component: import('@hdsp/form-schema').ComponentNode) => {
    return (
      <MemoizedField
        key={component.id}
        component={component}
        registry={registry}
        value={answers[component.fieldKey]}
        error={visibleErrors[component.fieldKey]}
        onChange={handleChange}
        onBlur={markTouched}
        renderChild={renderComponent}
      />
    );
  }, [registry, answers, visibleErrors, handleChange, markTouched]);

  const page = resolvedSchema.pages[0];

  return (
    <form data-testid="form-renderer" onSubmit={handleSubmit}>
      <div style={{ position: 'relative' }}>
        {page?.components
          .slice()
          .sort((a, b) => a.geometry.z - b.geometry.z)
          .map(renderComponent)}
      </div>
      <button type="submit">{submitLabel}</button>
      {!validation.valid && Object.keys(visibleErrors).length > 0 && (
        <div role="alert" style={{ color: '#c62828', fontSize: 13, marginTop: 8 }}>
          Please fix the errors above before submitting.
        </div>
      )}
    </form>
  );
}

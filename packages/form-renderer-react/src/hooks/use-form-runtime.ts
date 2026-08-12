import { useCallback, useState } from 'react';
import type { FormSchema } from '@hdsp/form-schema';
import { validateAnswersAgainstSchema } from '@hdsp/form-schema';
import type { ComponentDefinition } from '@hdsp/form-schema';

/**
 * useFormRuntime — local fill-session state (answers, touched, errors) for
 * the Runtime Renderer (Milestone 4). This is intentionally simple local
 * React state, not a scene graph/command system: Runtime has no undo/redo,
 * no selection, no canvas — it is a much simpler state shape than the
 * Designer's CanvasEngine (ADR-003's Builder/Renderer separation drawn in
 * the implementation, not just in the docs).
 */
export function useFormRuntime(schema: FormSchema, definitions: ComponentDefinition[], initialAnswers: Record<string, unknown> = {}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const setValue = useCallback((fieldKey: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
  }, []);

  const markTouched = useCallback((fieldKey: string) => {
    setTouched((prev) => ({ ...prev, [fieldKey]: true }));
  }, []);

  const validation = validateAnswersAgainstSchema(schema, answers, definitions);

  const visibleErrors: Record<string, string[]> = {};
  Object.entries(validation.errors).forEach(([fieldKey, msgs]) => {
    if (touched[fieldKey]) visibleErrors[fieldKey] = msgs;
  });

  const touchAll = useCallback(() => {
    const allKeys = schema.pages.flatMap((p) => p.components.map((c) => c.fieldKey));
    setTouched(Object.fromEntries(allKeys.map((k) => [k, true])));
  }, [schema]);

  return { answers, setValue, markTouched, touchAll, validation, visibleErrors };
}

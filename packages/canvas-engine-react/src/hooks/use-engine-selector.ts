import { useEffect, useState } from 'react';
import type { CanvasEngine, CanvasEngineState } from '@hdsp/canvas-engine';

/**
 * useEngineSelector — the ONLY way React reads engine state (ADR-004,
 * Phase 5A §2.1/§8). Never read `engine.scene`/`engine.viewport` etc.
 * directly in a component; always go through this hook so re-renders are
 * driven by the engine's own change events, not incidental prop plumbing.
 */
export function useEngineSelector<T>(engine: CanvasEngine, selector: (state: CanvasEngineState) => T): T {
  const [value, setValue] = useState(() => selector(engine.getState()));

  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      setValue(selector(engine.getState()));
    });
    // Catch any state change that happened between initial render and effect mount.
    setValue(selector(engine.getState()));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  return value;
}

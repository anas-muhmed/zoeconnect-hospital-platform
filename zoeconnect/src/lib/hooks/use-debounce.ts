import { useEffect, useState } from "react";

/**
 * Plain, generic debounce hook -- mirrors frontend/src/lib/hooks/useDebounce.ts
 * (the hospital app's own copy) exactly. Duplicated rather than imported
 * across apps: zoeconnect and frontend are separate Next.js deployables
 * with independent dependency trees (see docker/zoeconnect.Dockerfile vs.
 * docker/frontend.Dockerfile) and no shared React-hooks package exists in
 * this monorepo today (packages/ only holds CMS-specific canvas-engine/
 * form-schema code) -- adding one for a single ~10-line hook would be more
 * machinery than the problem needs.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

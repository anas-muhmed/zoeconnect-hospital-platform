'use client';

/**
 * /dev/canvas-sandbox — Milestone 2 ("Canvas Core") release-candidate demo.
 *
 * Internal engineering smoke test, deliberately NOT part of the authenticated
 * (platform) app shell and NOT linked from any nav menu — Milestone 2's scope
 * is proving the canvas engine, not shipping a product surface
 * (docs/architecture/MILESTONE_PLAN.md — Milestone 2 non-goals: "No UI beyond
 * a usable but unstyled designer surface"). Milestone 3 is where a real
 * Designer route under (platform) is built, backed by the Document Engine.
 *
 * Manual QA checklist against the Milestone 2 exit criterion:
 *   - Add Rectangle, drag it around, resize is exercised via engine tests.
 *   - Marquee-select by dragging on empty canvas; Shift-click to add to selection.
 *   - Undo/Redo via toolbar buttons or Ctrl+Z / Ctrl+Shift+Z.
 *   - Delete/Backspace removes the selection.
 *   - Mouse wheel zooms toward the cursor; "Fit to Page" recenters.
 *   - "Save" logs a client-side JSON snapshot below — no server call is made
 *     (Document Engine wiring is Milestone 3 scope).
 */
import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { CanvasEngine } from '@hdsp/canvas-engine';
import { CanvasEngineHost } from '@hdsp/canvas-engine-react';

export default function CanvasSandboxPage() {
  const engine = useMemo(() => new CanvasEngine(), []);
  const [snapshot, setSnapshot] = useState<string>('');

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Canvas Sandbox — Milestone 2 (Canvas Core)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Internal smoke-test surface only. Not part of the product navigation.
      </Typography>

      <CanvasEngineHost engine={engine} width={900} height={600} onSnapshot={setSnapshot} />

      {snapshot && (
        <Paper variant="outlined" sx={{ mt: 2, p: 2, maxWidth: 900, overflow: 'auto' }}>
          <Typography variant="subtitle2" gutterBottom>
            Client-side snapshot (no server call):
          </Typography>
          <pre style={{ margin: 0, fontSize: 12 }}>{snapshot}</pre>
        </Paper>
      )}
    </Box>
  );
}

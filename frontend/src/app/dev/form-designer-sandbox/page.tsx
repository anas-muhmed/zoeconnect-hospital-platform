'use client';

/**
 * /dev/form-designer-sandbox — Milestone 3 ("Basic Components") release
 * candidate demo: Design → Save → Reload → Render against the REAL Document
 * Engine backend (not a client-side JSON export like Milestone 2's sandbox).
 *
 * Internal engineering smoke test — not part of product navigation. Requires
 * being logged into ZoeConnect in this same browser (the shared `apiClient` reads
 * the JWT from the existing auth store), since the Designer API endpoints
 * are guarded like every other ZoeConnect endpoint (JwtAuthGuard + PermissionsGuard,
 * permission keys FORMS:DESIGNER:CREATE/READ/UPDATE).
 *
 * Manual QA checklist against the Milestone 3 exit criterion:
 *   1. Add all six Wave 1 components via the palette.
 *   2. Click "Save to Document Engine" — creates a document + draft version
 *      via POST /forms/designer/documents and /versions.
 *   3. Click "Clear Canvas" then "Reload from Document Engine" — fetches the
 *      saved version and re-renders it. The canvas should look identical.
 */
import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import { CanvasEngine, sceneGraphToFormSchema, loadFormSchemaIntoEngine } from '@hdsp/canvas-engine';
import {
  CanvasEngineHost,
  useEngineCommands,
  useEngineSelector,
  registerAllComponents,
  COMPONENT_DEFAULT_SIZE,
} from '@hdsp/canvas-engine-react';
import { ComponentRegistry, type FormSchema } from '@hdsp/form-schema';
import { apiClient } from '@/lib/api/client';

// Register all form components once at module level
const registry = new ComponentRegistry();
registerAllComponents(registry);

const PAGE_ID = 'page-1';
const FORM_ID = 'dev-sandbox-form';

export default function FormDesignerSandboxPage() {
  const engine = useMemo(() => new CanvasEngine(), []);
  const registry = useMemo(() => {
    const r = new ComponentRegistry();
    registerAllComponents(r);
    return r;
  }, []);

  const [documentId, setDocumentId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [lastSchema, setLastSchema] = useState<FormSchema | null>(null);

  async function handleSave() {
    try {
      const schema = sceneGraphToFormSchema(engine, { formId: FORM_ID, category: 'custom', pageId: PAGE_ID });
      let docId = documentId;
      if (!docId) {
        const { data } = await apiClient.post('/forms/designer/documents', {
          name: 'Milestone 3 Sandbox Form',
          category: 'custom',
        });
        docId = data.id;
        setDocumentId(docId);
      }

      let verId = versionId;
      if (!verId) {
        const { data } = await apiClient.post(`/forms/designer/documents/${docId}/versions`, { schema });
        verId = data.id;
        setVersionId(verId);
      } else {
        await apiClient.patch(`/forms/designer/documents/${docId}/versions/${verId}`, { schema });
      }

      setLastSchema(schema);
      setStatus({ kind: 'success', message: `Saved (document ${docId}, version ${verId}) via the real Document Engine.` });
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.response?.data?.message ?? err?.message ?? 'Save failed.' });
    }
  }

  async function handleReload() {
    if (!documentId || !versionId) {
      setStatus({ kind: 'info', message: 'Nothing saved yet — click "Save to Document Engine" first.' });
      return;
    }
    try {
      const { data } = await apiClient.get(`/forms/designer/documents/${documentId}/versions/${versionId}`);
      loadFormSchemaIntoEngine(data.payload, engine);
      setStatus({ kind: 'success', message: 'Reloaded from the Document Engine and re-rendered onto the canvas.' });
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.response?.data?.message ?? err?.message ?? 'Reload failed.' });
    }
  }

  function handleClear() {
    engine.getState().nodes.forEach((n) => engine.removeNode(n.id));
    setStatus({ kind: 'info', message: 'Canvas cleared client-side (nothing deleted on the server).' });
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Form Designer Sandbox — Milestone 3 (Basic Components)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Internal smoke-test surface only, proving Design→Save→Reload→Render against the real Document Engine.
        Requires an existing ZoeConnect login in this browser.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={handleSave}>
          Save to Document Engine
        </Button>
        <Button variant="outlined" onClick={handleClear}>
          Clear Canvas
        </Button>
        <Button variant="outlined" onClick={handleReload}>
          Reload from Document Engine
        </Button>
      </Stack>

      {status && (
        <Alert severity={status.kind === 'info' ? 'info' : status.kind} sx={{ mb: 2 }}>
          {status.message}
        </Alert>
      )}

      <CanvasEngineHost engine={engine} registry={registry} width={900} height={600} />

      {lastSchema && (
        <Paper variant="outlined" sx={{ mt: 2, p: 2, maxWidth: 900, maxHeight: 400, overflow: 'auto' }}>
          <Typography variant="subtitle2" gutterBottom>
            Last saved FormSchema:
          </Typography>
          <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(lastSchema, null, 2)}</pre>
        </Paper>
      )}
    </Box>
  );
}

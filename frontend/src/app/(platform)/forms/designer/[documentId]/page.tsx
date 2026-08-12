'use client';

/**
 * Production Form Designer — Milestone 8.
 *
 * Full-screen 3-panel layout:
 *   Left: Component Library  |  Center: Infinite Canvas  |  Right: Inspector + Layers
 *   Bottom: Status Bar
 *
 * Replaces the Milestone 3 dev sandbox (/dev/form-designer-sandbox).
 * Lives in the platform shell with auth/RBAC — requires FORMS:DESIGNER:READ.
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  CanvasEngine,
  sceneGraphToFormSchema,
  loadFormSchemaIntoEngine,
} from '@hdsp/canvas-engine';
import {
  CanvasEngineHost,
  useEngineSelector,
  useEngineCommands,
  registerAllComponents,
} from '@hdsp/canvas-engine-react';
import { ComponentRegistry } from '@hdsp/form-schema';
import { apiClient } from '@/lib/api/client';
import { DesignerToolbar } from '@/components/forms-designer/DesignerToolbar';
import { DesignerLeftPanel } from '@/components/forms-designer/DesignerLeftPanel';
import { DesignerRightPanel } from '@/components/forms-designer/DesignerRightPanel';
import { DesignerStatusBar } from '@/components/forms-designer/DesignerStatusBar';
import { DesignerCanvas } from '@/components/forms-designer/DesignerCanvas';
import { COMPONENT_DEFAULT_SIZE, PluginRegistry } from '@hdsp/canvas-engine-react';
import { VitalsPlugin } from '@hdsp/canvas-engine-react/dist/plugins/vitals-plugin';

const FORM_PAGE_ID = 'page-1';

export default function FormDesignerEditorPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = params?.documentId as string | undefined;

  const engine = useMemo(() => new CanvasEngine(), []);
  const commands = useEngineCommands(engine);

  const pluginRegistry = useMemo(() => {
    const registry = new PluginRegistry();
    // Register built-in components manually for now, or via a "CorePlugin" in the future
    registerAllComponents(registry.componentRegistry);
    
    // Attempt to register external plugins if they exist
    // In the future this will be dynamically loaded based on hospital/tenant settings
    return registry;
  }, []);

  // ── Engine state ────────────────────────────────────────────────────────
  const nodes = useEngineSelector(engine, (s) => s.nodes);
  const selectedIds = useEngineSelector(engine, (s) => s.selectedIds);
  const viewport = useEngineSelector(engine, (s) => s.viewport);
  const canUndo = useEngineSelector(engine, (s) => s.canUndo);
  const canRedo = useEngineSelector(engine, (s) => s.canRedo);

  // ── Local state ─────────────────────────────────────────────────────────
  const [formName, setFormName] = useState('Untitled Form');
  const [versionId, setVersionId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 });
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load existing document on mount ────────────────────────────────────
  useEffect(() => {
    if (!documentId || documentId === 'new') return;
    (async () => {
      try {
        const docRes = await apiClient.get(`/forms/designer/documents/${documentId}`);
        setFormName(docRes.data.name ?? 'Untitled Form');
        const versRes = await apiClient.get(`/forms/designer/documents/${documentId}/versions`);
        const versions: any[] = versRes.data ?? [];
        if (versions.length > 0) {
          const latest = versions[versions.length - 1];
          setVersionId(latest.id);
          loadFormSchemaIntoEngine(latest.payload, engine);
        }
      } catch (e) {
        console.error('Failed to load document', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); commands.undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) { e.preventDefault(); commands.redo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commands.removeSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, documentId, versionId, formName]);

  // ── Autosave on change ──────────────────────────────────────────────────
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (nodes.length === 0) return;
    autosaveTimer.current = setTimeout(() => {
      handleSave(true);
    }, 3000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (silent = false) => {
    if (!silent) setSaveStatus('saving');
    try {
      const schema = sceneGraphToFormSchema(engine, { formId: documentId ?? 'new', category: 'clinical', pageId: FORM_PAGE_ID });
      let docId = documentId && documentId !== 'new' ? documentId : null;

      if (!docId) {
        const res = await apiClient.post('/forms/designer/documents', { name: formName, category: 'clinical' });
        docId = res.data.id;
        router.replace(`/forms/designer/${docId}`);
      }

      if (!versionId) {
        const res = await apiClient.post(`/forms/designer/documents/${docId}/versions`, { schema });
        setVersionId(res.data.id);
      } else {
        await apiClient.patch(`/forms/designer/documents/${docId}/versions/${versionId}`, { schema });
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [engine, documentId, formName, versionId, router]);

  // ── Publish ─────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!documentId || documentId === 'new' || !versionId) {
      await handleSave();
    }
    if (!versionId) return;
    try {
      await apiClient.post(`/forms/designer/documents/${documentId}/versions/${versionId}/publish`);
      setSaveStatus('saved');
    } catch (e) {
      console.error('Publish failed', e);
      setSaveStatus('error');
    }
  }, [documentId, versionId, handleSave]);

  // ── Add component from palette (click) ─────────────────────────────────
  const handleAddComponent = useCallback((type: string) => {
    const size = COMPONENT_DEFAULT_SIZE[type] ?? { width: 240, height: 60 };
    const vp = engine.viewport.getState();
    const cx = (vp.panX + 450) / vp.zoom - size.width / 2; // Assuming ~900px wide canvas viewport
    const cy = (vp.panY + 300) / vp.zoom - size.height / 2; // Assuming ~600px high canvas viewport
    const def = pluginRegistry.componentRegistry.get(type);
    const props = def?.defaultSchema ?? { label: type };
    engine.addComponentNode(type, { x: cx, y: cy }, size, props);
  }, [engine]);

  // ── Drop from palette ───────────────────────────────────────────────────
  const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const type = e.dataTransfer.getData('application/x-hdsp-component-type');
    if (!type) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const vp = engine.viewport.getState();
    const worldX = (e.clientX - rect.left - vp.panX) / vp.zoom;
    const worldY = (e.clientY - rect.top - vp.panY) / vp.zoom;
    const size = COMPONENT_DEFAULT_SIZE[type] ?? { width: 240, height: 60 };
    const def = pluginRegistry.componentRegistry.get(type);
    const props = def?.defaultSchema ?? { label: type };

    // Find valid drop target
    const hits = engine.scene.list().filter(n => {
      if (!n.visible) return false;
      const targetDef = pluginRegistry.componentRegistry.get(n.type);
      if (!targetDef?.canHaveChildren) return false;
      if (targetDef.acceptedChildTypes && !targetDef.acceptedChildTypes.includes(type)) return false;
      if (targetDef.maxChildren !== undefined) {
        const currentChildren = engine.scene.getChildren(n.id).length;
        if (currentChildren >= targetDef.maxChildren) return false;
      }
      const abs = engine.scene.getAbsoluteGeometry(n.id);
      return worldX >= abs.x && worldX <= abs.x + abs.width &&
             worldY >= abs.y && worldY <= abs.y + abs.height;
    });
    const dropTarget = hits[hits.length - 1];

    engine.addComponentNode(
      type, 
      { x: worldX - size.width / 2, y: worldY - size.height / 2 }, 
      size, 
      props, 
      undefined, 
      dropTarget?.id
    );
  }, [engine]);

  const warningCount = nodes.filter((n) => (n.props as any)?._importMeta?.needsReview).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: '#0a0a1a' }}>
      {/* Top Toolbar */}
      <DesignerToolbar
        formName={formName}
        onFormNameChange={setFormName}
        saveStatus={saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        onBack={() => router.push('/forms/designer')}
      />

      {/* 3-column body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel */}
        <DesignerLeftPanel registry={pluginRegistry} />

        {/* Center Canvas */}
        <div style={{ flex: 1, position: 'relative', background: '#111827' }}>
          <DesignerCanvas 
            engine={engine} 
            registry={pluginRegistry.componentRegistry} 
            onCanvasDrop={handleCanvasDrop} 
            onCursorMove={setCursorWorld} 
          />
        </div>

        {/* Right Panel */}
        <DesignerRightPanel registry={pluginRegistry} />
      </div>

      {/* Status Bar */}
      <DesignerStatusBar
        selectedCount={selectedIds.length}
        cursorX={cursorWorld.x}
        cursorY={cursorWorld.y}
        zoom={viewport.zoom}
        warningCount={warningCount}
        nodeCount={nodes.length}
      />
    </div>
  );
}

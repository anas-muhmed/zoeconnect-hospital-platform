import { useMemo } from 'react';
import type { CanvasEngine } from '@hdsp/canvas-engine';

/**
 * useEngineCommands — the ONLY way React writes to the engine (ADR-004). Every
 * method here ultimately dispatches through CanvasEngine's Command system;
 * components never mutate scene nodes in place.
 */
export function useEngineCommands(engine: CanvasEngine) {
  return useMemo(
    () => ({
      addRectangle: engine.addRectangle.bind(engine),
      removeNode: engine.removeNode.bind(engine),
      removeSelected: engine.removeSelected.bind(engine),
      moveNodes: engine.moveNodes.bind(engine),
      resizeNode: engine.resizeNode.bind(engine),
      updateNodeGeometry: engine.updateNodeGeometry.bind(engine),
      undo: engine.undo.bind(engine),
      redo: engine.redo.bind(engine),
      selectAt: engine.selectAt.bind(engine),
      selectRect: engine.selectRect.bind(engine),
      clearSelection: () => engine.selection.clear(),
      panBy: engine.viewport.panBy.bind(engine.viewport),
      zoomAt: engine.viewport.zoomAt.bind(engine.viewport),
      addComponentNode: engine.addComponentNode.bind(engine),
      setNodeProps: engine.setNodeProps.bind(engine),
      copySelected: engine.copySelected.bind(engine),
      paste: engine.paste.bind(engine),
      duplicateSelected: engine.duplicateSelected.bind(engine),
      fitToPage: engine.viewport.fitToPage.bind(engine.viewport),
      exportSnapshot: engine.exportSnapshot.bind(engine),
      startTransaction: engine.startTransaction.bind(engine),
      commitTransaction: engine.commitTransaction.bind(engine),
      cancelTransaction: engine.cancelTransaction.bind(engine),
    }),
    [engine],
  );
}

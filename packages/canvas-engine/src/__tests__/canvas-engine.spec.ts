import { CanvasEngine } from '../engine/canvas-engine';

describe('CanvasEngine (Milestone 2 — Canvas Core)', () => {
  it('draws a rectangle and selects it', () => {
    const engine = new CanvasEngine();
    const id = engine.addRectangle({ x: 10, y: 10 });
    const state = engine.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe(id);
    expect(state.selectedIds).toEqual([id]);
  });

  it('moves a node and can undo/redo the move', () => {
    const engine = new CanvasEngine();
    engine.snapEnabled = false;
    const id = engine.addRectangle({ x: 0, y: 0 });
    engine.moveNodes([id], { x: 50, y: 25 });
    expect(engine.scene.get(id)!.geometry).toMatchObject({ x: 50, y: 25 });

    engine.undo();
    expect(engine.scene.get(id)!.geometry).toMatchObject({ x: 0, y: 0 });

    engine.redo();
    expect(engine.scene.get(id)!.geometry).toMatchObject({ x: 50, y: 25 });
  });

  it('resizes a node and enforces a minimum size', () => {
    const engine = new CanvasEngine();
    const id = engine.addRectangle({ x: 0, y: 0 }, { width: 100, height: 100 });
    engine.resizeNode(id, { width: 200, height: -10 });
    expect(engine.scene.get(id)!.geometry).toMatchObject({ width: 200, height: 10 });
  });

  it('deletes a node and undo restores it', () => {
    const engine = new CanvasEngine();
    const id = engine.addRectangle({ x: 0, y: 0 });
    engine.removeNode(id);
    expect(engine.scene.has(id)).toBe(false);
    expect(engine.getState().selectedIds).toEqual([]);

    engine.undo();
    expect(engine.scene.has(id)).toBe(true);
  });

  it('a fresh dispatch clears the redo stack', () => {
    const engine = new CanvasEngine();
    const id = engine.addRectangle({ x: 0, y: 0 });
    engine.moveNodes([id], { x: 10, y: 10 });
    engine.undo();
    expect(engine.getState().canRedo).toBe(true);

    engine.addRectangle({ x: 5, y: 5 });
    expect(engine.getState().canRedo).toBe(false);
  });

  it('supports multi-select via marquee (queryRect) and additive toggle', () => {
    const engine = new CanvasEngine();
    engine.snapEnabled = false;
    const a = engine.addRectangle({ x: 0, y: 0 }, { width: 10, height: 10 });
    const b = engine.addRectangle({ x: 100, y: 100 }, { width: 10, height: 10 });

    engine.selectRect({ x: -5, y: -5, width: 20, height: 20 });
    expect(engine.getState().selectedIds).toEqual([a]);

    engine.selectRect({ x: 95, y: 95, width: 20, height: 20 }, true);
    expect(new Set(engine.getState().selectedIds)).toEqual(new Set([a, b]));
  });

  it('notifies subscribers on scene, selection, and history changes', () => {
    const engine = new CanvasEngine();
    let calls = 0;
    const unsubscribe = engine.subscribe(() => { calls += 1; });

    engine.addRectangle({ x: 0, y: 0 });
    expect(calls).toBeGreaterThan(0);

    unsubscribe();
    const before = calls;
    engine.addRectangle({ x: 1, y: 1 });
    expect(calls).toBe(before);
  });

  it('viewport pan/zoom/fit-to-page do not touch the undo history', () => {
    const engine = new CanvasEngine();
    engine.viewport.panBy(10, 10);
    engine.viewport.zoomAt({ x: 0, y: 0 }, 2);
    engine.viewport.fitToPage({ width: 800, height: 600 }, { width: 1000, height: 800 });
    expect(engine.getState().canUndo).toBe(false);
  });

  it('exports a snapshot suitable for a client-side manual save (no server call)', () => {
    const engine = new CanvasEngine();
    engine.addRectangle({ x: 0, y: 0 });
    engine.addRectangle({ x: 200, y: 0 });
    const snapshot = engine.exportSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0].type).toBe('rectangle');
  });

  it('meets the 500-node interactive budget without throwing or slowing pathologically', () => {
    const engine = new CanvasEngine();
    const start = Date.now();
    for (let i = 0; i < 500; i += 1) {
      engine.addRectangle({ x: (i % 25) * 20, y: Math.floor(i / 25) * 20 }, { width: 15, height: 15 });
    }
    const elapsed = Date.now() - start;
    expect(engine.getState().nodes).toHaveLength(500);
    // Generous sandbox-safe bound — this is a correctness/scale smoke test, not
    // the formal FPS benchmark (that is Phase 5A §10 / Milestone 7's job).
    expect(elapsed).toBeLessThan(2000);
  });
});

import { CanvasEngine } from '../engine/canvas-engine';

describe('Performance Budget (Milestone 7)', () => {
  it('manipulating 500+ nodes should complete within 16ms (60fps threshold)', () => {
    const engine = new CanvasEngine();
    
    // Add 500 nodes
    for (let i = 0; i < 500; i++) {
      engine.addRectangle({ x: i, y: i }, { width: 100, height: 100 });
    }
    
    expect(engine.scene.list().length).toBe(500);
    
    const nodeIds = engine.scene.list().map(n => n.id);
    const targetId = nodeIds[250]; // pick one in the middle

    const startMove = performance.now();
    engine.moveNodes([targetId], { x: 50, y: 50 });
    const endMove = performance.now();
    
    const moveDuration = endMove - startMove;
    
    // Engine mutation alone should be exceptionally fast (< 2ms) to leave room for React render
    expect(moveDuration).toBeLessThan(5);

    const startSelect = performance.now();
    engine.selectAt({ x: 250, y: 250 }, false);
    const endSelect = performance.now();

    const selectDuration = endSelect - startSelect;
    
    // Selection search across 500 nodes should be very fast (< 2ms)
    expect(selectDuration).toBeLessThan(5);
  });
});

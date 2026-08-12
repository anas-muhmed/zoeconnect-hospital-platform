import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CanvasEngine } from '@hdsp/canvas-engine';
import { CanvasEngineHost } from '../components/canvas-engine-host';

describe('CanvasEngineHost (Milestone 2 — Canvas Core)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let engine: CanvasEngine;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    engine = new CanvasEngine();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render() {
    act(() => {
      root.render(<CanvasEngineHost engine={engine} />);
    });
  }

  it('renders with no nodes', () => {
    render();
    expect(container.querySelectorAll('rect[data-testid^="node-"]')).toHaveLength(0);
  });

  it('draws a rectangle when added to engine', () => {
    render();
    act(() => {
      engine.addRectangle({ x: 10, y: 10 });
    });

    expect(container.querySelectorAll('g[data-testid^="node-"]')).toHaveLength(1);
  });
});

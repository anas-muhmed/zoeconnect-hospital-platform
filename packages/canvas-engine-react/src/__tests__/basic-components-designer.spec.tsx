import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CanvasEngine } from '@hdsp/canvas-engine';
import { ComponentRegistry } from '@hdsp/form-schema';
import { CanvasEngineHost } from '../components/canvas-engine-host';
import { registerAllComponents } from '../components/register-components';

describe('CanvasEngineHost + Wave 1 components (Milestone 3)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let engine: CanvasEngine;
  let registry: ComponentRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    engine = new CanvasEngine();
    registry = new ComponentRegistry();
    registerAllComponents(registry);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render() {
    act(() => {
      root.render(<CanvasEngineHost engine={engine} registry={registry} />);
    });
  }

  it('placing a Textbox renders its real DesignerComponent, not a generic placeholder', () => {
    render();
    act(() => {
      engine.addComponentNode('textbox', { x: 10, y: 10 }, { width: 200, height: 40 }, { label: 'Test Label' });
    });

    expect(container.querySelector('foreignObject input[type="text"], foreignObject input:not([type])')).toBeTruthy();
    expect(container.textContent).not.toContain('Unregistered type');
  });

  it('the Rectangle test shape still works unchanged alongside registered components', () => {
    render();
    act(() => {
      engine.addRectangle({ x: 50, y: 50 });
    });
    expect(container.querySelectorAll('g[data-testid^="node-"]')).toHaveLength(1);
    expect(container.querySelector('rect[fill]')).toBeTruthy();
  });
});

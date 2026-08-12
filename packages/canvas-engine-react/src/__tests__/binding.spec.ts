import { getBoundEngineVersion, CANVAS_ENGINE_REACT_VERSION } from '../index';
import { CANVAS_ENGINE_VERSION } from '@hdsp/canvas-engine';

describe('@hdsp/canvas-engine-react (Milestone 2 — Canvas Core binding)', () => {
  it('successfully imports and calls into @hdsp/canvas-engine', () => {
    expect(getBoundEngineVersion()).toBe(CANVAS_ENGINE_VERSION);
  });

  it('exposes its own version marker', () => {
    expect(typeof CANVAS_ENGINE_REACT_VERSION).toBe('string');
  });
});

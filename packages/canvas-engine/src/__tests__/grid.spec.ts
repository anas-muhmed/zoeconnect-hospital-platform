import { snapToGrid, snapValue } from '../grid/grid';

describe('grid snapping (Milestone 2)', () => {
  it('snaps a point to the nearest grid cell', () => {
    expect(snapToGrid({ x: 13, y: 27 }, 10)).toEqual({ x: 10, y: 30 });
  });

  it('is a no-op when gridSize is 0', () => {
    expect(snapToGrid({ x: 13, y: 27 }, 0)).toEqual({ x: 13, y: 27 });
  });

  it('snaps a scalar value', () => {
    expect(snapValue(24, 10)).toBe(20);
    expect(snapValue(26, 10)).toBe(30);
  });
});

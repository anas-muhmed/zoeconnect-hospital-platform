/**
 * Grid + snap-to-grid math (Milestone 2 scope, Phase 5A §2). Pure functions,
 * no state — the engine decides whether snapping is currently enabled.
 */
import type { Point } from '../viewport/viewport';

export function snapToGrid(point: Point, gridSize: number): Point {
  if (gridSize <= 0) return point;
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

export function snapValue(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

import { EventBus } from '../events/event-bus';

/**
 * Viewport — camera state (pan/zoom) over the infinite canvas (Phase 3 §2,
 * Phase 5A §2). Pan/zoom is deliberately NOT undoable content — it is
 * ephemeral UI state, not a Command (see command-history.ts docblock).
 */
export interface Point {
  x: number;
  y: number;
}

export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
  rotation: number;
  snapEnabled: boolean;
  gridSize: number;
  pageVisibility: 'single' | 'continuous' | 'presentation';
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

export class Viewport {
  private state: ViewportState = { 
    panX: 0, panY: 0, zoom: 1, 
    rotation: 0, snapEnabled: true, gridSize: 10, pageVisibility: 'single' 
  };

  constructor(private readonly bus: EventBus) {}

  getState(): ViewportState {
    return { ...this.state };
  }

  panBy(dx: number, dy: number): void {
    this.state = { ...this.state, panX: this.state.panX + dx, panY: this.state.panY + dy };
    this.bus.emit({ type: 'viewport:changed' });
  }

  /** Zoom by a multiplicative factor, keeping `screenPoint` visually fixed. */
  zoomAt(screenPoint: Point, factor: number): void {
    const newZoom = clamp(this.state.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const worldPoint = this.screenToWorld(screenPoint);
    this.state = { ...this.state, zoom: newZoom };
    const newScreenPoint = this.worldToScreen(worldPoint);
    this.state = {
      ...this.state,
      panX: this.state.panX + (screenPoint.x - newScreenPoint.x),
      panY: this.state.panY + (screenPoint.y - newScreenPoint.y),
    };
    this.bus.emit({ type: 'viewport:changed' });
  }

  /** Fits a page-sized world rect into a viewport-sized screen rect, centered. */
  fitToPage(pageSize: { width: number; height: number }, viewportSize: { width: number; height: number }): void {
    const zoom = clamp(
      Math.min(viewportSize.width / pageSize.width, viewportSize.height / pageSize.height) * 0.95,
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const panX = (viewportSize.width - pageSize.width * zoom) / 2;
    const panY = (viewportSize.height - pageSize.height * zoom) / 2;
    this.state = { ...this.state, panX, panY, zoom };
    this.bus.emit({ type: 'viewport:changed' });
  }

  reset(): void {
    this.state = { 
      panX: 0, panY: 0, zoom: 1, 
      rotation: 0, snapEnabled: true, gridSize: 10, pageVisibility: 'single' 
    };
    this.bus.emit({ type: 'viewport:changed' });
  }

  worldToScreen(point: Point): Point {
    return { x: point.x * this.state.zoom + this.state.panX, y: point.y * this.state.zoom + this.state.panY };
  }

  screenToWorld(point: Point): Point {
    return { x: (point.x - this.state.panX) / this.state.zoom, y: (point.y - this.state.panY) / this.state.zoom };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

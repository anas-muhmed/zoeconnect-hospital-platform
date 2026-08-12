/**
 * Minimal internal event bus (ADR-004 — canvas-engine owns "scene graph,
 * spatial index, event bus, command system, viewport"). Milestone 2 uses this
 * only to notify subscribers (the React host) that engine state changed; it is
 * deliberately generic so later milestones (Rule Engine reacting to
 * PROPERTY_CHANGED, etc. — Phase 2 §2) can subscribe to the same bus without
 * re-plumbing.
 */
export type EngineEventType =
  | 'scene:changed'
  | 'selection:changed'
  | 'viewport:changed'
  | 'history:changed';

export interface EngineEvent<T = unknown> {
  type: EngineEventType;
  payload?: T;
}

type Listener = (event: EngineEvent) => void;

export class EventBus {
  private listeners = new Map<EngineEventType, Set<Listener>>();

  on(type: EngineEventType, listener: Listener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.off(type, listener);
  }

  off(type: EngineEventType, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(event: EngineEvent): void {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
  }

  clear(): void {
    this.listeners.clear();
  }
}

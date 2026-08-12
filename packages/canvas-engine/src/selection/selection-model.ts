import { EventBus } from '../events/event-bus';

/**
 * SelectionModel — single/multi selection over scene node ids (Phase 3 §2,
 * Phase 5A §2). Selection is view-state, like the Viewport: it is not part of
 * the undo/redo content history.
 */
export class SelectionModel {
  private selected = new Set<string>();

  constructor(private readonly bus: EventBus) {}

  select(id: string): void {
    this.selected = new Set([id]);
    this.bus.emit({ type: 'selection:changed' });
  }

  selectMany(ids: string[]): void {
    this.selected = new Set(ids);
    this.bus.emit({ type: 'selection:changed' });
  }

  toggle(id: string): void {
    const next = new Set(this.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected = next;
    this.bus.emit({ type: 'selection:changed' });
  }

  clear(): void {
    if (this.selected.size === 0) return;
    this.selected = new Set();
    this.bus.emit({ type: 'selection:changed' });
  }

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  getSelectedIds(): string[] {
    return [...this.selected];
  }

  /** Drops ids that no longer exist in the scene graph (e.g. after a delete). */
  prune(existingIds: Set<string>): void {
    const next = new Set([...this.selected].filter((id) => existingIds.has(id)));
    if (next.size !== this.selected.size) {
      this.selected = next;
      this.bus.emit({ type: 'selection:changed' });
    }
  }
}

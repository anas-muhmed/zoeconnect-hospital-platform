type SelectionListener = (selectedIds: string[]) => void;

/**
 * DesignerSelectionService — a centralized selection service for the UI to decouple
 * panels (Properties, Layers, Accessibility, etc.) from the engine's internals.
 * All UI plugins consume the same selection state here.
 */
export class DesignerSelectionService {
  private selectedIds: string[] = [];
  private listeners = new Set<SelectionListener>();

  setSelection(ids: string[]) {
    this.selectedIds = ids;
    this.notify();
  }

  getSelection(): string[] {
    return this.selectedIds;
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l(this.selectedIds));
  }
}

// Global instance for the designer (this could be provided via Context in a full implementation)
export const designerSelectionService = new DesignerSelectionService();

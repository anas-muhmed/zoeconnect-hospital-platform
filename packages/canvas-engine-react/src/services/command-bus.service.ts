export type DesignerCommandId =
  | 'undo'
  | 'redo'
  | 'save_draft'
  | 'publish'
  | 'preview'
  | 'ai_generate'
  | 'zoom_in'
  | 'zoom_out'
  | 'fit_to_page'
  | 'toggle_grid'
  | 'toggle_snap'
  | 'delete_selection'
  | 'history';

export interface CommandEvent {
  id: DesignerCommandId;
  payload?: any;
}

type CommandListener = (event: CommandEvent) => void;

/**
 * CommandBus — shared infrastructure for invoking actions across the designer.
 * Buttons, keyboard shortcuts, and plugins can dispatch commands here, and the
 * appropriate handlers (whether in the engine or the host application) will respond.
 */
export class CommandBus {
  private listeners = new Set<CommandListener>();

  dispatch(id: DesignerCommandId, payload?: any) {
    const event = { id, payload };
    this.listeners.forEach((l) => l(event));
  }

  subscribe(listener: CommandListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// Global instance
export const commandBus = new CommandBus();

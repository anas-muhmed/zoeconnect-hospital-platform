import { Command } from './command';
import { CompoundCommand } from './scene-commands';
import { EventBus } from '../events/event-bus';

/**
 * CommandHistory — linear undo/redo stack (Phase 5A §5, Milestone 2 scope).
 * Dispatching a new command clears the redo stack, matching standard
 * editor semantics (Figma/VS Code): you cannot redo past a new edit.
 */
export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  private transactionDepth = 0;
  private transactionName = 'Transaction';
  private transactionCommands: Command[] = [];

  constructor(private readonly bus: EventBus) {}

  execute(command: Command): void {
    if (this.transactionDepth > 0) {
      command.execute();
      this.transactionCommands.push(command);
      return;
    }

    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    this.bus.emit({ type: 'history:changed' });
  }

  startTransaction(name: string = 'Transaction'): void {
    if (this.transactionDepth === 0) {
      this.transactionName = name;
      this.transactionCommands = [];
    }
    this.transactionDepth++;
  }

  commitTransaction(): void {
    if (this.transactionDepth > 0) {
      this.transactionDepth--;
      if (this.transactionDepth === 0 && this.transactionCommands.length > 0) {
        const compound = new CompoundCommand(this.transactionName, this.transactionCommands);
        this.undoStack.push(compound);
        this.redoStack = [];
        this.transactionCommands = [];
        this.bus.emit({ type: 'history:changed' });
      }
    }
  }

  cancelTransaction(): void {
    if (this.transactionDepth > 0) {
      this.transactionDepth--;
      if (this.transactionDepth === 0) {
        // Roll back any executed commands in the transaction
        [...this.transactionCommands].reverse().forEach(c => c.undo());
        this.transactionCommands = [];
        this.bus.emit({ type: 'history:changed' });
      }
    }
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.bus.emit({ type: 'history:changed' });
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.execute();
    this.undoStack.push(command);
    this.bus.emit({ type: 'history:changed' });
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.bus.emit({ type: 'history:changed' });
  }
}

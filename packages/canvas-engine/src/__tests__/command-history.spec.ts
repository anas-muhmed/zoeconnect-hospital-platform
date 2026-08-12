import { CommandHistory } from '../commands/command-history';
import { EventBus } from '../events/event-bus';
import { Command } from '../commands/command';

function counterCommand(ref: { value: number }, delta: number): Command {
  return {
    name: 'increment',
    execute: () => { ref.value += delta; },
    undo: () => { ref.value -= delta; },
  };
}

describe('CommandHistory (Milestone 2)', () => {
  it('executes, undoes, and redoes in order', () => {
    const bus = new EventBus();
    const history = new CommandHistory(bus);
    const ref = { value: 0 };

    history.execute(counterCommand(ref, 5));
    history.execute(counterCommand(ref, 3));
    expect(ref.value).toBe(8);

    history.undo();
    expect(ref.value).toBe(5);
    history.undo();
    expect(ref.value).toBe(0);

    history.redo();
    expect(ref.value).toBe(5);
  });

  it('undo/redo on an empty stack is a safe no-op', () => {
    const history = new CommandHistory(new EventBus());
    expect(() => history.undo()).not.toThrow();
    expect(() => history.redo()).not.toThrow();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('a new command clears the redo stack', () => {
    const bus = new EventBus();
    const history = new CommandHistory(bus);
    const ref = { value: 0 };
    history.execute(counterCommand(ref, 1));
    history.undo();
    expect(history.canRedo()).toBe(true);
    history.execute(counterCommand(ref, 2));
    expect(history.canRedo()).toBe(false);
  });
});

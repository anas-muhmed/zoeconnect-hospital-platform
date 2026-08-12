import { ComponentRegistry } from '../registry/component-registry';
import type { ComponentDefinition } from '../registry/component-definition';

function makeDefinition(id: string, category: ComponentDefinition['category'] = 'basic'): ComponentDefinition {
  return {
    id,
    displayName: id,
    category,
    icon: 'icon',
    sdkVersion: '1.0.0',
    propertySchema: { sections: [] },
    validate: () => ({ valid: true, errors: [] }),
    serialize: (v) => v,
    deserialize: (v) => v,
    defaultSchema: {},
    supportedEvents: [],
    supportedValidations: [],
    supportedBindings: 'none',
  };
}

describe('ComponentRegistry (ADR-005 — Milestone 1: registration mechanics only)', () => {
  it('starts empty', () => {
    const registry = new ComponentRegistry();
    expect(registry.list()).toHaveLength(0);
  });

  it('registers and retrieves a component definition', () => {
    const registry = new ComponentRegistry();
    const def = makeDefinition('textbox');
    registry.register(def);
    expect(registry.get('textbox')).toBe(def);
    expect(registry.has('textbox')).toBe(true);
  });

  it('rejects a duplicate id registration', () => {
    const registry = new ComponentRegistry();
    registry.register(makeDefinition('textbox'));
    expect(() => registry.register(makeDefinition('textbox'))).toThrow(/already registered/);
  });

  it('lists components filtered by category', () => {
    const registry = new ComponentRegistry();
    registry.register(makeDefinition('textbox', 'input'));
    registry.register(makeDefinition('label', 'basic'));
    expect(registry.listByCategory('input')).toHaveLength(1);
    expect(registry.listByCategory('input')[0].id).toBe('textbox');
  });

  it('unregisters and clears', () => {
    const registry = new ComponentRegistry();
    registry.register(makeDefinition('textbox'));
    registry.unregister('textbox');
    expect(registry.has('textbox')).toBe(false);

    registry.register(makeDefinition('a'));
    registry.register(makeDefinition('b'));
    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });
});

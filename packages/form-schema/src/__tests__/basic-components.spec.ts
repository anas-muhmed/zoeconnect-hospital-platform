import { BASIC_COMPONENT_DEFINITIONS } from '../components/basic';
import { textboxDefinition } from '../components/basic/textbox';
import { checkboxDefinition } from '../components/basic/checkbox';
import { dropdownDefinition } from '../components/basic/dropdown';
import { ComponentRegistry } from '../registry/component-registry';

describe('Wave 1 basic component metadata (Milestone 3, ADR-005)', () => {
  it('registers all six Wave 1 components without id collisions', () => {
    const registry = new ComponentRegistry();
    BASIC_COMPONENT_DEFINITIONS.forEach((def) => registry.register(def));
    expect(registry.list()).toHaveLength(6);
    expect(['label', 'textbox', 'textarea', 'checkbox', 'radio', 'dropdown'].every((id) => registry.has(id))).toBe(
      true,
    );
  });

  it('every definition declares a non-empty propertySchema and a typed defaultSchema', () => {
    BASIC_COMPONENT_DEFINITIONS.forEach((def) => {
      expect(def.propertySchema.sections.length).toBeGreaterThan(0);
      expect(def.defaultSchema.type).toBe(def.id);
    });
  });

  it('textbox validate() enforces required', () => {
    const result = textboxDefinition.validate('', [{ kind: 'required' }], {});
    expect(result.valid).toBe(false);
    expect(textboxDefinition.validate('hello', [{ kind: 'required' }], {}).valid).toBe(true);
  });

  it('textbox validate() enforces a regex rule', () => {
    const rules = [{ kind: 'regex' as const, pattern: '^[0-9]+$', message: 'Digits only' }];
    expect(textboxDefinition.validate('abc', rules, {}).valid).toBe(false);
    expect(textboxDefinition.validate('123', rules, {}).valid).toBe(true);
  });

  it('checkbox validate() treats "required" as "must be checked"', () => {
    expect(checkboxDefinition.validate(false, [{ kind: 'required' }], {}).valid).toBe(false);
    expect(checkboxDefinition.validate(true, [{ kind: 'required' }], {}).valid).toBe(true);
  });

  it('dropdown validate() enforces required on an empty selection', () => {
    expect(dropdownDefinition.validate('', [{ kind: 'required' }], {}).valid).toBe(false);
    expect(dropdownDefinition.validate('option_1', [{ kind: 'required' }], {}).valid).toBe(true);
  });
});

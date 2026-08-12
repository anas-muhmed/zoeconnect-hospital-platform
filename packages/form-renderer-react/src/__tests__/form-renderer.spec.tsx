import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ComponentRegistry, CURRENT_SCHEMA_VERSION, type FormSchema } from '@hdsp/form-schema';
import { FormRenderer } from '../components/form-renderer';
import { registerAllRuntimeComponents } from '../components/register-runtime-components';

/**
 * Milestone 4 exit-criterion smoke test (React layer): a clinician fills a
 * Wave-1-only form and submits it, with client-side validation blocking an
 * incomplete submission — proving the Renderer half of ADR-003's
 * Builder/Renderer separation actually works, not just compiles.
 */
function makeSchema(): FormSchema {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    formId: 'f1',
    category: 'registration',
    dataSources: [],
    pages: [
      {
        id: 'p1',
        size: 'A4',
        orientation: 'portrait',
        components: [
          {
            id: 'n1', type: 'label', fieldKey: 'title',
            geometry: { x: 0, y: 0, w: 200, h: 30, z: 0, pageId: 'p1' },
            props: { text: 'Patient Registration', variant: 'heading', align: 'left' },
            validation: [], logic: {}, permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: false },
          },
          {
            id: 'n2', type: 'textbox', fieldKey: 'full_name',
            geometry: { x: 0, y: 40, w: 240, h: 56, z: 1, pageId: 'p1' },
            props: { label: 'Full Name', placeholder: '', defaultValue: '', maxLength: 255, required: true },
            validation: [{ kind: 'required' }], logic: {}, permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: true },
          },
        ],
      },
    ],
  };
}

describe('FormRenderer (Milestone 4 — Runtime)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let registry: ComponentRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    registry = new ComponentRegistry();
    registerAllRuntimeComponents(registry);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('blocks submit and shows an error when a required field is empty', () => {
    const onSubmit = jest.fn();
    act(() => {
      root.render(<FormRenderer schema={makeSchema()} registry={registry} onSubmit={onSubmit} />);
    });

    const form = container.querySelector('form')!;
    act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('submits with the filled answers once required fields are completed', () => {
    const onSubmit = jest.fn();
    act(() => {
      root.render(<FormRenderer schema={makeSchema()} registry={registry} onSubmit={onSubmit} />);
    });

    const input = container.querySelector('#full_name') as HTMLInputElement;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      nativeInputValueSetter.call(input, 'Jane Doe');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('form')!;
    act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(onSubmit).toHaveBeenCalledWith({ full_name: 'Jane Doe' });
  });

  it('renders the Label field as display-only text, not an input', () => {
    act(() => {
      root.render(<FormRenderer schema={makeSchema()} registry={registry} onSubmit={jest.fn()} />);
    });
    expect(container.querySelector('[data-testid="field-title"]')?.textContent).toContain('Patient Registration');
    expect(container.querySelector('[data-testid="field-title"] input')).toBeNull();
  });
});

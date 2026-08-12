import { CanvasEngine } from '../engine/canvas-engine';
import { sceneGraphToFormSchema } from '../schema-bridge/scene-to-schema';
import { loadFormSchemaIntoEngine } from '../schema-bridge/schema-to-scene';
import { textboxDefinition, checkboxDefinition } from '@hdsp/form-schema';

/**
 * Milestone 3 exit-criterion test at the engine level: build → serialize →
 * deserialize → identical scene restored, for real (registered) component
 * types — not just the Milestone 2 Rectangle test shape, which the bridge
 * deliberately excludes (see scene-to-schema.ts).
 */
describe('FormSchema <-> SceneGraph bridge (Milestone 3, ADR-001)', () => {
  it('serializes scene nodes into a FormSchema with correct geometry field mapping', () => {
    const engine = new CanvasEngine();
    engine.snapEnabled = false;
    const id = engine.addComponentNode(
      'textbox',
      { x: 10, y: 20 },
      { width: 200, height: 40 },
      { ...textboxDefinition.defaultSchema.props },
      'patient_name',
    );

    const schema = sceneGraphToFormSchema(engine, { formId: 'form-1', category: 'custom', pageId: 'page-1' });
    expect(schema.pages).toHaveLength(1);
    const component = schema.pages[0].components.find((c) => c.id === id)!;
    expect(component.type).toBe('textbox');
    expect(component.fieldKey).toBe('patient_name');
    expect(component.geometry).toMatchObject({ x: 10, y: 20, w: 200, h: 40, z: 0, pageId: 'page-1' });
    expect(component.props).toEqual(textboxDefinition.defaultSchema.props);
  });

  it('excludes the Milestone 2 Rectangle test shape from the saved schema', () => {
    const engine = new CanvasEngine();
    engine.addRectangle({ x: 0, y: 0 });
    const schema = sceneGraphToFormSchema(engine, { formId: 'f', category: 'custom', pageId: 'p1' });
    expect(schema.pages[0].components).toHaveLength(0);
  });

  it('round-trips a form with all six Wave 1 component types (Milestone 3 exit criterion)', () => {
    const engine = new CanvasEngine();
    engine.snapEnabled = false;
    const specs: Array<[string, unknown, string]> = [
      ['label', { text: 'Patient Registration', variant: 'heading', align: 'left' }, 'title'],
      ['textbox', { ...textboxDefinition.defaultSchema.props, label: 'Full Name' }, 'full_name'],
      ['textarea', { label: 'Notes', placeholder: '', defaultValue: '', rows: 4, maxLength: 500, required: false }, 'notes'],
      ['checkbox', { ...checkboxDefinition.defaultSchema.props, label: 'Consent Given' }, 'consent'],
      [
        'radio',
        { label: 'Gender', options: [{ label: 'Male', value: 'm' }, { label: 'Female', value: 'f' }], defaultValue: '', required: true },
        'gender',
      ],
      [
        'dropdown',
        { label: 'Department', options: [{ label: 'Cardiology', value: 'cardio' }], placeholder: 'Select…', defaultValue: '', required: false },
        'department',
      ],
    ];

    specs.forEach(([type, props, fieldKey], i) => {
      engine.addComponentNode(type, { x: 0, y: i * 50 }, { width: 240, height: 40 }, props, fieldKey);
    });

    const savedSchema = sceneGraphToFormSchema(engine, { formId: 'reg-form', category: 'registration', pageId: 'page-1' });
    expect(savedSchema.pages[0].components).toHaveLength(6);

    // Simulate persistence: JSON round trip through the Document Engine's jsonb payload.
    const persisted = JSON.parse(JSON.stringify(savedSchema));

    const reloadedEngine = new CanvasEngine();
    loadFormSchemaIntoEngine(persisted, reloadedEngine);

    const reloadedSchema = sceneGraphToFormSchema(reloadedEngine, {
      formId: 'reg-form',
      category: 'registration',
      pageId: 'page-1',
    });

    expect(reloadedSchema).toEqual(savedSchema);
    expect(reloadedEngine.getState().nodes.map((n) => n.type).sort()).toEqual(
      ['checkbox', 'dropdown', 'label', 'radio', 'textarea', 'textbox'],
    );
  });

  it('loading a document clears undo history and selection (fresh state, not an undoable edit)', () => {
    const engine = new CanvasEngine();
    engine.addComponentNode('label', { x: 0, y: 0 }, { width: 100, height: 20 }, { text: 'x', variant: 'body', align: 'left' });
    expect(engine.getState().canUndo).toBe(true);

    const schema = sceneGraphToFormSchema(engine, { formId: 'f', category: 'custom', pageId: 'p1' });
    loadFormSchemaIntoEngine(schema, engine);

    expect(engine.getState().canUndo).toBe(false);
    expect(engine.getState().selectedIds).toEqual([]);
  });
});

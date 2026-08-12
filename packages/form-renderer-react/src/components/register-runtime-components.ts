import { 
  ComponentRegistry, 
  BASIC_COMPONENT_DEFINITIONS,
  STRUCTURAL_COMPONENT_DEFINITIONS,
  COMPLEX_COMPONENT_DEFINITIONS,
  MEDICAL_COMPONENT_DEFINITIONS,
} from '@hdsp/form-schema';
import {
  LabelRenderer,
  TextboxRenderer,
  TextAreaRenderer,
  CheckboxRenderer,
  RadioRenderer,
  DropdownRenderer,
} from './basic/renderer-components';
import {
  BodyDiagramRenderer,
  DentalChartRenderer,
  BurnAssessmentRenderer,
  SvgAnnotationLayerRenderer,
} from './medical/renderer-components-medical';
import {
  ContainerRenderer,
  SectionRenderer,
  FallbackContainer,
} from './structural/renderer-components-structural';
import { SignatureRenderer } from './complex/renderer-components-complex';

const RENDERER_COMPONENTS: Record<string, unknown> = {
  label: LabelRenderer,
  textbox: TextboxRenderer,
  textarea: TextAreaRenderer,
  checkbox: CheckboxRenderer,
  radio: RadioRenderer,
  dropdown: DropdownRenderer,

  // Stubs for structural and complex
  container: ContainerRenderer,
  section: SectionRenderer,
  card: FallbackContainer,
  columns: FallbackContainer,
  tabs: FallbackContainer,
  accordion: FallbackContainer,

  table: () => null,
  'repeat-section': () => null,
  variables: () => null,
  rules: () => null,
  signature: SignatureRenderer,

  // Medical
  body_diagram: BodyDiagramRenderer,
  dental_chart: DentalChartRenderer,
  burn_assessment: BurnAssessmentRenderer,
  svg_annotation_layer: SvgAnnotationLayerRenderer,
};

export function registerAllRuntimeComponents(registry: ComponentRegistry): void {
  const allDefs = [
    ...BASIC_COMPONENT_DEFINITIONS,
    ...STRUCTURAL_COMPONENT_DEFINITIONS,
    ...COMPLEX_COMPONENT_DEFINITIONS,
    ...MEDICAL_COMPONENT_DEFINITIONS,
  ];

  allDefs.forEach((def) => {
    if (registry.has(def.id)) return;
    registry.register({ ...def, RendererComponent: RENDERER_COMPONENTS[def.id] });
  });
}

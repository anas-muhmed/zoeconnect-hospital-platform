import { 
  ComponentRegistry, 
  BASIC_COMPONENT_DEFINITIONS,
  STRUCTURAL_COMPONENT_DEFINITIONS,
  COMPLEX_COMPONENT_DEFINITIONS,
  MEDICAL_COMPONENT_DEFINITIONS,
} from '@hdsp/form-schema';
import {
  LabelDesigner,
  TextboxDesigner,
  TextAreaDesigner,
  CheckboxDesigner,
  RadioDesigner,
  DropdownDesigner,
} from './basic/designer-components';
import {
  ContainerDesigner,
  SectionDesigner,
  CardDesigner,
  ColumnsDesigner,
  TabsDesigner,
  AccordionDesigner,
} from './structural/designer-components-structural';
import {
  TableDesigner,
  RepeatSectionDesigner,
  VariablesDesigner,
  RulesDesigner,
  SignatureDesigner,
} from './complex/designer-components-complex';
import {
  BodyDiagramDesigner,
  DentalChartDesigner,
  BurnAssessmentDesigner,
  SvgAnnotationLayerDesigner,
} from './medical/designer-components-medical';
import { MedicalCustomInspector } from './medical/custom-inspectors';

export const COMPONENT_DEFAULT_SIZE: Record<string, { width: number; height: number }> = {
  label: { width: 220, height: 32 },
  textbox: { width: 260, height: 56 },
  textarea: { width: 260, height: 120 },
  checkbox: { width: 220, height: 32 },
  radio: { width: 260, height: 100 },
  dropdown: { width: 260, height: 56 },

  // Structural
  container: { width: 400, height: 200 },
  section: { width: 600, height: 200 },
  card: { width: 300, height: 200 },
  columns: { width: 600, height: 100 },
  tabs: { width: 400, height: 200 },
  accordion: { width: 400, height: 150 },

  // Complex
  table: { width: 500, height: 200 },
  'repeat-section': { width: 400, height: 150 },
  variables: { width: 200, height: 50 },
  rules: { width: 200, height: 50 },
  signature: { width: 300, height: 120 },

  // Medical
  body_diagram: { width: 300, height: 400 },
  dental_chart: { width: 400, height: 300 },
  burn_assessment: { width: 400, height: 500 },
  svg_annotation_layer: { width: 400, height: 400 },
};

const DESIGNER_COMPONENTS: Record<string, unknown> = {
  label: LabelDesigner,
  textbox: TextboxDesigner,
  textarea: TextAreaDesigner,
  checkbox: CheckboxDesigner,
  radio: RadioDesigner,
  dropdown: DropdownDesigner,

  // Structural
  container: ContainerDesigner,
  section: SectionDesigner,
  card: CardDesigner,
  columns: ColumnsDesigner,
  tabs: TabsDesigner,
  accordion: AccordionDesigner,

  // Complex
  table: TableDesigner,
  'repeat-section': RepeatSectionDesigner,
  variables: VariablesDesigner,
  rules: RulesDesigner,
  signature: SignatureDesigner,

  // Medical
  body_diagram: BodyDiagramDesigner,
  dental_chart: DentalChartDesigner,
  burn_assessment: BurnAssessmentDesigner,
  svg_annotation_layer: SvgAnnotationLayerDesigner,
};

const CUSTOM_INSPECTORS: Record<string, unknown> = {
  body_diagram: MedicalCustomInspector,
  dental_chart: MedicalCustomInspector,
  burn_assessment: MedicalCustomInspector,
  svg_annotation_layer: MedicalCustomInspector,
};

export function registerAllComponents(registry: ComponentRegistry): void {
  const allDefs = [
    ...BASIC_COMPONENT_DEFINITIONS,
    ...STRUCTURAL_COMPONENT_DEFINITIONS,
    ...COMPLEX_COMPONENT_DEFINITIONS,
    ...MEDICAL_COMPONENT_DEFINITIONS,
  ];

  allDefs.forEach((def) => {
    if (registry.has(def.id)) return;
    registry.register({ 
      ...def, 
      DesignerComponent: DESIGNER_COMPONENTS[def.id],
      PropertyEditor: CUSTOM_INSPECTORS[def.id]
    });
  });
}

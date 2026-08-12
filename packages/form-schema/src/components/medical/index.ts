import { bodyDiagramDefinition } from './body-diagram';
import { dentalChartDefinition } from './dental-chart';
import { burnAssessmentDefinition } from './burn-assessment';
import { svgAnnotationLayerDefinition } from './svg-annotation-layer';

export * from './types';
export * from './body-diagram';
export * from './dental-chart';
export * from './burn-assessment';
export * from './svg-annotation-layer';

export const MEDICAL_COMPONENT_DEFINITIONS = [
  bodyDiagramDefinition,
  dentalChartDefinition,
  burnAssessmentDefinition,
  svgAnnotationLayerDefinition,
];

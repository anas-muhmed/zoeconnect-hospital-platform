export interface AssetReference {
  assetId: string;
  width: number;
  height: number;
}

export interface RegionDefinition {
  id: string;
  label: string;
  svgPath: string; // The interactive area defined as an SVG path relative to the asset size
}

export interface AnnotationItem {
  id: string;
  type: 'freehand' | 'text' | 'region_selection';
  points?: { x: number; y: number }[]; // For freehand
  text?: string;
  x?: number;
  y?: number;
  regionId?: string;
  color?: string;
}

export interface MedicalComponentProps {
  asset: AssetReference | null;
  regions: RegionDefinition[];
}

export interface MedicalComponentValue {
  annotations: AnnotationItem[];
}

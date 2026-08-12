/**
 * SceneNode — the framework-agnostic scene graph unit (Phase 3 §2, ADR-004).
 * Milestone 2 ships exactly one concrete node kind ('rectangle') to prove the
 * render loop; real form components (Textbox, Dropdown, ...) are Milestone 3+
 * and will extend `props` rather than requiring a new node shape.
 */
export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface SceneNode<TProps = any> {
  id: string;
  type: string;
  geometry: Geometry;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  props: TProps;
  /**
   * Form-field identity (Milestone 3+ — Wave 1 components use this; the
   * Milestone 2 Rectangle test shape leaves it undefined). Optional so it
   * does not break the Milestone 2 SceneNode shape.
   */
  fieldKey?: string;
  /**
   * Structural hierarchy (Milestone 5+ Wave 2 components). Allows nesting inside
   * Containers, Sections, Columns, etc.
   */
  parentId?: string;
}

export interface RectangleProps {
  fill: string;
  stroke: string;
}

export type RectangleNode = SceneNode<RectangleProps>;

export function createRectangleNode(
  id: string,
  geometry: Geometry,
  zIndex: number,
  props: Partial<RectangleProps> = {},
): RectangleNode {
  return {
    id,
    type: 'rectangle',
    geometry,
    zIndex,
    locked: false,
    visible: true,
    props: { fill: props.fill ?? '#90caf9', stroke: props.stroke ?? '#1565c0' },
  };
}

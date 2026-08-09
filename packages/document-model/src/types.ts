/** Stable string GUID: `${sessionID}:${localID}` */
export type NodeId = string;

export type NodeType =
  | "DOCUMENT"
  | "PAGE"
  | "FRAME"
  | "GROUP"
  | "SECTION"
  | "RECTANGLE"
  | "ELLIPSE"
  | "LINE"
  | "VECTOR"
  | "BOOLEAN_OPERATION"
  | "TEXT"
  | "COMPONENT"
  | "INSTANCE"
  | "SLICE"
  | "VARIABLE"
  | "VARIABLE_SET"
  | "UNKNOWN";

export type BlendMode =
  | "PASS_THROUGH"
  | "NORMAL"
  | "MULTIPLY"
  | "SCREEN"
  | "OVERLAY"
  | "DARKEN"
  | "LIGHTEN"
  | "COLOR_DODGE"
  | "COLOR_BURN"
  | "HARD_LIGHT"
  | "SOFT_LIGHT"
  | "DIFFERENCE"
  | "EXCLUSION"
  | "HUE"
  | "SATURATION"
  | "COLOR"
  | "LUMINOSITY"
  | string;

export type StrokeAlign = "CENTER" | "INSIDE" | "OUTSIDE" | string;

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Affine 2x3 matrix: [m00 m01 m02; m10 m11 m12] */
export interface Mat2D {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
}

export interface SolidPaint {
  type: "SOLID";
  color: Color;
  opacity: number;
  visible: boolean;
  blendMode: BlendMode;
}

export interface ImagePaint {
  type: "IMAGE";
  imageHash?: string;
  scaleMode?: string;
  opacity: number;
  visible: boolean;
  blendMode: BlendMode;
}

export interface GradientPaint {
  type:
    | "GRADIENT_LINEAR"
    | "GRADIENT_RADIAL"
    | "GRADIENT_ANGULAR"
    | "GRADIENT_DIAMOND";
  stops: Array<{ color: Color; position: number }>;
  opacity: number;
  visible: boolean;
  blendMode: BlendMode;
  transform?: Mat2D;
}

export type Paint = SolidPaint | ImagePaint | GradientPaint | {
  type: string;
  opacity: number;
  visible: boolean;
  blendMode: BlendMode;
  [key: string]: unknown;
};

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface AutoLayout {
  mode: "NONE" | "HORIZONTAL" | "VERTICAL" | string;
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  primaryAlign?: string;
  counterAlign?: string;
  primarySizing?: string;
  counterSizing?: string;
}

export interface TextStyle {
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight?: number | { value: number; unit: string };
  letterSpacing?: number | { value: number; unit: string };
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textCase?: string;
  textDecoration?: string;
  /** Figma-computed layout (from derivedTextData) — most accurate for rendering */
  derived?: {
    layoutWidth: number;
    layoutHeight: number;
    lineHeight: number;
    lineAscent: number;
    /** Baseline y relative to text node top (first line) */
    baselineY: number;
    /** First line x offset (for centered text this is padding to first glyph) */
    baselineX: number;
  };
}

export interface Effect {
  type: string;
  visible?: boolean;
  radius?: number;
  color?: Color;
  offset?: Vec2;
  spread?: number;
  blendMode?: string;
  showShadowBehindNode?: boolean;
  [key: string]: unknown;
}

export interface VectorPathData {
  /** SVG path d */
  d: string;
  windingRule: "nonzero" | "evenodd";
  /**
   * How the path should be painted:
   * - "fill" — closed/expanded outline (Figma fillGeometry or strokeGeometry); paint with fill()/stroke color
   * - "stroke" — centerline (vector-network fallback for Lucide-style icons); paint with stroke()
   * Default: fill for fillPaths; for strokePaths, "fill" means Figma expanded stroke outline.
   */
  paint?: "fill" | "stroke";
}

export interface SceneNodeBase {
  id: NodeId;
  type: NodeType;
  name: string;
  parentId: NodeId | null;
  /** Ordered child ids (for container types) */
  children: NodeId[];
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** Local transform relative to parent */
  transform: Mat2D;
  size: { width: number; height: number };
  fills: Paint[];
  strokes: Paint[];
  strokeWeight: number;
  strokeAlign: StrokeAlign;
  strokeCap?: string;
  strokeJoin?: string;
  effects: Effect[];
  cornerRadius?: number | CornerRadii;
  clipsContent?: boolean;
  /** Figma mask: this node defines opacity/alpha for siblings above it in a mask group */
  isMask?: boolean;
  /** When true, children outside bounds are clipped (Figma frames) */
  layout?: AutoLayout;
  /** Decoded vector geometry (icons, custom shapes) */
  fillPaths?: VectorPathData[];
  strokePaths?: VectorPathData[];
  /** Design-space size of vector network (for path scaling) */
  vectorNormalizedSize?: { width: number; height: number };
  /** Absolute bounds cache (world space) — recomputed by layout/renderer */
  absoluteTransform?: Mat2D;
  absoluteBounds?: { x: number; y: number; width: number; height: number };
  /** Stack child grow factor (auto-layout) */
  layoutGrow?: number;
  layoutAlign?: string;
  /** Unmapped Figma fields for round-trip fidelity */
  _figma?: Record<string, unknown>;
}

export interface TextNode extends SceneNodeBase {
  type: "TEXT";
  characters: string;
  textStyle: TextStyle;
}

export interface InstanceNode extends SceneNodeBase {
  type: "INSTANCE";
  componentId?: NodeId;
  componentKey?: string;
}

export interface ComponentNode extends SceneNodeBase {
  type: "COMPONENT";
  componentKey?: string;
}

export type SceneNode =
  | SceneNodeBase
  | TextNode
  | InstanceNode
  | ComponentNode;

export interface Page {
  id: NodeId;
  name: string;
  /** Root child ids on this page (frames, etc.) */
  children: NodeId[];
  background: Color;
  /** Internal Figma canvases (components library, etc.) */
  internal?: boolean;
}

export interface FileMeta {
  backgroundColor?: Color;
  renderCoordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  thumbnailSize?: { width: number; height: number };
  exportedAt?: string;
  source?: "fig-import" | "figma-fig" | "figma-clipboard" | "alteron" | "blank" | string;
}

export interface AlteronDocument {
  version: 1;
  name: string;
  meta: FileMeta;
  /** All nodes keyed by id (flat map for O(1) lookup) */
  nodes: Record<NodeId, SceneNode>;
  pages: Page[];
  /** Active page id */
  currentPageId: NodeId | null;
  /** Image assets by hash → data URL or raw key */
  assets: Record<string, { hash: string; mimeType: string; dataUrl?: string; byteLength: number }>;
  /** Cached kiwi schema from last .fig import (base64) for clipboard */
  figmaSchemaBase64?: string;
  components: Record<NodeId, { id: NodeId; name: string; key?: string }>;
}

export function identityMat(): Mat2D {
  return { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
}

export function createEmptyDocument(name = "Untitled"): AlteronDocument {
  const pageId = "0:1";
  const doc: AlteronDocument = {
    version: 1,
    name,
    meta: {
      backgroundColor: { r: 0.12, g: 0.12, b: 0.12, a: 1 },
      source: "blank",
    },
    nodes: {},
    pages: [
      {
        id: pageId,
        name: "Page 1",
        children: [],
        background: { r: 0.12, g: 0.12, b: 0.12, a: 1 },
      },
    ],
    currentPageId: pageId,
    assets: {},
    components: {},
  };
  return doc;
}

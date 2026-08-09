/** Figma GUID as stored in kiwi messages */
export interface FigGuid {
  sessionID: number;
  localID: number;
}

export interface FigParentIndex {
  guid: FigGuid;
  position: string;
}

export interface FigColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigVector {
  x: number;
  y: number;
}

export interface FigMatrix {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
}

export interface FigPaint {
  type: string;
  color?: FigColor;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
  image?: { hash?: Uint8Array | string; name?: string };
  imageScaleMode?: string;
  transform?: FigMatrix;
  stops?: Array<{ color: FigColor; position: number }>;
  [key: string]: unknown;
}

export interface FigNodeChange {
  guid: FigGuid;
  type: string;
  name?: string;
  phase?: string;
  visible?: boolean;
  opacity?: number;
  parentIndex?: FigParentIndex;
  size?: FigVector;
  transform?: FigMatrix;
  fillPaints?: FigPaint[];
  strokePaints?: FigPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  strokeJoin?: string;
  cornerRadius?: number;
  rectangleTopLeftCornerRadius?: number;
  rectangleTopRightCornerRadius?: number;
  rectangleBottomLeftCornerRadius?: number;
  rectangleBottomRightCornerRadius?: number;
  rectangleCornerRadiiIndependent?: boolean;
  blendMode?: string;
  clipsContent?: boolean;
  stackMode?: string;
  stackSpacing?: number;
  stackPadding?: number;
  stackHorizontalPadding?: number;
  stackVerticalPadding?: number;
  stackPaddingRight?: number;
  stackPaddingBottom?: number;
  stackPrimaryAlignItems?: string;
  stackCounterAlignItems?: string;
  stackPrimarySizing?: string;
  stackCounterSizing?: string;
  stackChildPrimaryGrow?: number;
  stackChildAlignSelf?: string;
  fontSize?: number;
  fontName?: { family: string; style: string; postscript?: string };
  textData?: {
    characters?: string;
    lines?: unknown[];
  };
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: { value?: number; units?: string };
  letterSpacing?: { value?: number; units?: string };
  symbolData?: {
    symbolID?: FigGuid;
    symbolOverrides?: unknown[];
  };
  overrideKey?: FigGuid;
  componentKey?: string;
  effects?: unknown[];
  constraints?: unknown;
  fillGeometry?: unknown;
  strokeGeometry?: unknown;
  /** blob index references */
  [key: string]: unknown;
}

export interface FigBlob {
  bytes?: Uint8Array;
  [key: string]: unknown;
}

export interface FigMessage {
  type?: string;
  nodeChanges?: FigNodeChange[];
  blobs?: FigBlob[];
  pasteID?: number;
  pasteFileKey?: string;
  pastePageId?: FigGuid;
  [key: string]: unknown;
}

export interface FigMeta {
  client_meta?: {
    background_color?: FigColor;
    thumbnail_size?: { width: number; height: number };
    render_coordinates?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  file_name?: string;
  exported_at?: string;
  developer_related_links?: unknown[];
  [key: string]: unknown;
}

export interface FigArchiveHeader {
  prelude: string;
  version: number;
}

export interface DecodedFigFile {
  header: FigArchiveHeader;
  meta: FigMeta;
  message: FigMessage;
  /** raw binary schema bytes (decompressed) — cache for clipboard decode */
  schemaBytes: Uint8Array;
  /** compiled kiwi schema (dynamic) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compiledSchema: any;
  images: Map<string, Uint8Array>;
  thumbnail?: Uint8Array;
}

export interface ClipboardFigPayload {
  meta: Record<string, unknown>;
  message: FigMessage;
  schemaBytes?: Uint8Array;
}

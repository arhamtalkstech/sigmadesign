import type {
  AutoLayout,
  BlendMode,
  Color,
  CornerRadii,
  Mat2D,
  NodeId,
  NodeType,
  Paint,
  SceneNode,
  TextStyle,
} from "@alteron/document-model";
import { identityMat } from "@alteron/document-model";
import type { FigNodeChange, FigPaint } from "@alteron/fig-format";
import { guidToString } from "@alteron/fig-format";

export function mapNodeType(figType: string): NodeType {
  switch (figType) {
    case "DOCUMENT":
      return "DOCUMENT";
    case "CANVAS":
      return "PAGE";
    case "FRAME":
      return "FRAME";
    case "GROUP":
      return "GROUP";
    case "SECTION":
      return "SECTION";
    case "ROUNDED_RECTANGLE":
    case "RECTANGLE":
      return "RECTANGLE";
    case "ELLIPSE":
      return "ELLIPSE";
    case "LINE":
      return "LINE";
    case "VECTOR":
    case "STAR":
    case "REGULAR_POLYGON":
      return "VECTOR";
    case "BOOLEAN_OPERATION":
      return "BOOLEAN_OPERATION";
    case "TEXT":
      return "TEXT";
    case "SYMBOL":
      return "COMPONENT";
    case "INSTANCE":
      return "INSTANCE";
    case "SLICE":
      return "SLICE";
    case "VARIABLE":
      return "VARIABLE";
    case "VARIABLE_SET":
      return "VARIABLE_SET";
    default:
      return "UNKNOWN";
  }
}

function mapColor(c?: {
  r: number;
  g: number;
  b: number;
  a: number;
}): Color {
  if (!c) return { r: 0, g: 0, b: 0, a: 1 };
  return { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
}

function mapPaint(p: FigPaint): Paint {
  const base = {
    opacity: p.opacity ?? 1,
    visible: p.visible !== false,
    blendMode: (p.blendMode ?? "NORMAL") as BlendMode,
  };

  if (p.type === "SOLID") {
    return {
      type: "SOLID",
      color: mapColor(p.color),
      ...base,
    };
  }

  if (p.type === "IMAGE") {
    let imageHash: string | undefined;
    const img = p.image as { hash?: Uint8Array | number[] | string } | undefined;
    if (img?.hash) {
      if (typeof img.hash === "string") imageHash = img.hash;
      else imageHash = bytesToHex(img.hash);
    }
    return {
      type: "IMAGE",
      imageHash,
      scaleMode: p.imageScaleMode,
      ...base,
    };
  }

  if (
    p.type === "GRADIENT_LINEAR" ||
    p.type === "GRADIENT_RADIAL" ||
    p.type === "GRADIENT_ANGULAR" ||
    p.type === "GRADIENT_DIAMOND"
  ) {
    return {
      type: p.type,
      stops: (p.stops ?? []).map((s) => ({
        color: mapColor(s.color),
        position: s.position,
      })),
      transform: p.transform as Mat2D | undefined,
      ...base,
    };
  }

  return { type: p.type ?? "UNKNOWN", ...base };
}

function bytesToHex(bytes: Uint8Array | number[]): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function mapTransform(t?: {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
}): Mat2D {
  if (!t) return identityMat();
  return {
    m00: t.m00,
    m01: t.m01,
    m02: t.m02,
    m10: t.m10,
    m11: t.m11,
    m12: t.m12,
  };
}

function mapEffects(raw: unknown): SceneNode["effects"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e: Record<string, unknown>) => {
    const color = e.color as
      | { r: number; g: number; b: number; a?: number }
      | undefined;
    const offset = e.offset as { x: number; y: number } | undefined;
    return {
      type: String(e.type ?? "DROP_SHADOW"),
      visible: e.visible !== false,
      radius: typeof e.radius === "number" ? e.radius : 0,
      spread: typeof e.spread === "number" ? e.spread : 0,
      offset: offset ? { x: offset.x, y: offset.y } : { x: 0, y: 0 },
      color: color
        ? { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 }
        : undefined,
      blendMode: e.blendMode as string | undefined,
      showShadowBehindNode: e.showShadowBehindNode as boolean | undefined,
    };
  });
}

function mapCornerRadius(n: FigNodeChange): number | CornerRadii | undefined {
  // Only use per-corner values when Figma marks them independent.
  // Otherwise leftover tl/tr/bl/br fields (often 4) would override the real cornerRadius (e.g. 12).
  if (n.rectangleCornerRadiiIndependent) {
    const radii = {
      topLeft: n.rectangleTopLeftCornerRadius ?? n.cornerRadius ?? 0,
      topRight: n.rectangleTopRightCornerRadius ?? n.cornerRadius ?? 0,
      bottomRight: n.rectangleBottomRightCornerRadius ?? n.cornerRadius ?? 0,
      bottomLeft: n.rectangleBottomLeftCornerRadius ?? n.cornerRadius ?? 0,
    };
    if (
      radii.topLeft === radii.topRight &&
      radii.topRight === radii.bottomRight &&
      radii.bottomRight === radii.bottomLeft
    ) {
      return radii.topLeft;
    }
    return radii;
  }
  if (n.cornerRadius != null) return n.cornerRadius;
  return undefined;
}

function mapLayout(n: FigNodeChange): AutoLayout | undefined {
  if (!n.stackMode || n.stackMode === "NONE") return undefined;
  const padL = n.stackHorizontalPadding ?? n.stackPadding ?? 0;
  const padT = n.stackVerticalPadding ?? n.stackPadding ?? 0;
  const padR = n.stackPaddingRight ?? padL;
  const padB = n.stackPaddingBottom ?? padT;
  return {
    mode: n.stackMode,
    gap: n.stackSpacing ?? 0,
    padding: { top: padT, right: padR, bottom: padB, left: padL },
    primaryAlign: n.stackPrimaryAlignItems,
    counterAlign: n.stackCounterAlignItems,
    primarySizing: n.stackPrimarySizing,
    counterSizing: n.stackCounterSizing,
  };
}

export interface PathAttach {
  fillPaths?: Array<{
    d: string;
    windingRule: "nonzero" | "evenodd";
    paint?: "fill" | "stroke";
  }>;
  strokePaths?: Array<{
    d: string;
    windingRule: "nonzero" | "evenodd";
    paint?: "fill" | "stroke";
  }>;
  vectorNormalizedSize?: { width: number; height: number };
}

export function mapFigNode(
  n: FigNodeChange,
  children: NodeId[],
  paths?: PathAttach
): SceneNode {
  const id = guidToString(n.guid);
  const type = mapNodeType(n.type);
  const parentId = n.parentIndex
    ? guidToString(n.parentIndex.guid)
    : null;

  // stroke cap from vector style override or node field
  const styleTable = (
    n.vectorData as
      | { styleOverrideTable?: Array<{ strokeCap?: string; strokeJoin?: string }> }
      | undefined
  )?.styleOverrideTable?.[0];

  // Clipboard / partial nodeChanges sometimes omit or blank `name`
  const rawName = typeof n.name === "string" ? n.name.trim() : "";
  const base = {
    id,
    type,
    name: rawName || type,
    parentId,
    children,
    visible: n.visible !== false,
    locked: false,
    opacity: n.opacity ?? 1,
    blendMode: (n.blendMode ?? "PASS_THROUGH") as BlendMode,
    transform: mapTransform(n.transform),
    size: {
      width: n.size?.x ?? 0,
      height: n.size?.y ?? 0,
    },
    fills: (n.fillPaints ?? []).map(mapPaint),
    strokes: (n.strokePaints ?? []).map(mapPaint),
    strokeWeight: n.strokeWeight ?? 0,
    strokeAlign: (n.strokeAlign ?? "INSIDE") as SceneNode["strokeAlign"],
    strokeCap: (n.strokeCap as string | undefined) ?? styleTable?.strokeCap,
    strokeJoin: (n.strokeJoin as string | undefined) ?? styleTable?.strokeJoin,
    effects: mapEffects(n.effects),
    cornerRadius: mapCornerRadius(n),
    // Figma stores clipping as frameMaskDisabled (true = do NOT clip).
    // .fig files rarely set clipsContent; never invent clip=true when the flag is absent —
    // over-clipping hides Lucide stroke overflow and drop shadows.
    clipsContent:
      n.clipsContent ??
      (typeof n.frameMaskDisabled === "boolean"
        ? !n.frameMaskDisabled
        : undefined),
    // Figma `mask: true` — node is an alpha/luminance mask for siblings above it
    isMask: Boolean((n as { mask?: boolean }).mask),
    layout: mapLayout(n),
    layoutGrow: n.stackChildPrimaryGrow as number | undefined,
    layoutAlign: n.stackChildAlignSelf as string | undefined,
    fillPaths: paths?.fillPaths,
    strokePaths: paths?.strokePaths,
    vectorNormalizedSize: paths?.vectorNormalizedSize,
  };

  if (type === "TEXT") {
    const lh = n.lineHeight as
      | { value?: number; units?: string }
      | undefined;
    const ls = n.letterSpacing as
      | { value?: number; units?: string }
      | number
      | undefined;

    // Figma lineHeight RAW: unitless multiplier of fontSize (1 = 100%)
    let lineHeight: TextStyle["lineHeight"];
    if (lh && lh.value != null) {
      const units = (lh.units ?? "RAW").toUpperCase();
      if (units === "RAW") {
        lineHeight = {
          value: lh.value <= 4 ? lh.value * 100 : lh.value,
          unit: "PERCENT",
        };
      } else {
        lineHeight = {
          value: lh.value,
          unit: units === "PERCENT" ? "PERCENT" : "PIXELS",
        };
      }
    }

    let letterSpacing: TextStyle["letterSpacing"];
    // Prefer textTracking (fraction of em) when present — matches Figma canvas
    const tracking = n.textTracking as number | undefined;
    if (typeof tracking === "number" && Number.isFinite(tracking)) {
      letterSpacing = { value: tracking * 100, unit: "PERCENT" };
    } else if (typeof ls === "number") {
      letterSpacing = { value: ls, unit: "PIXELS" };
    } else if (ls && typeof ls === "object" && ls.value != null) {
      const units = (ls.units ?? "PIXELS").toUpperCase();
      letterSpacing = {
        value: ls.value,
        unit: units === "PERCENT" ? "PERCENT" : "PIXELS",
      };
    }

    // derivedTextData: Figma's precomputed glyph layout (authoritative for rendering)
    const dtd = n.derivedTextData as
      | {
          layoutSize?: { x: number; y: number };
          baselines?: Array<{
            position?: { x: number; y: number };
            width?: number;
            lineY?: number;
            lineHeight?: number;
            lineAscent?: number;
          }>;
        }
      | undefined;
    let derived: TextStyle["derived"];
    if (dtd?.baselines?.[0] || dtd?.layoutSize) {
      const b0 = dtd.baselines?.[0];
      derived = {
        layoutWidth: dtd.layoutSize?.x ?? n.size?.x ?? 0,
        layoutHeight: dtd.layoutSize?.y ?? n.size?.y ?? 0,
        lineHeight: b0?.lineHeight ?? (n.fontSize ?? 12) * 1.2,
        lineAscent: b0?.lineAscent ?? n.fontSize ?? 12,
        baselineY: b0?.position?.y ?? b0?.lineAscent ?? n.fontSize ?? 12,
        baselineX: b0?.position?.x ?? 0,
      };
    }

    // Normalize style labels so "Semi Bold" / "SemiBold" map consistently in the renderer
    const rawStyle = n.fontName?.style ?? "Regular";
    const textStyle: TextStyle = {
      fontFamily: n.fontName?.family ?? "Inter",
      fontStyle: rawStyle,
      fontSize: n.fontSize ?? 12,
      textAlignHorizontal: n.textAlignHorizontal,
      textAlignVertical: n.textAlignVertical,
      textCase: n.textCase as string | undefined,
      textDecoration: n.textDecoration as string | undefined,
      lineHeight,
      letterSpacing,
      derived,
    };
    return {
      ...base,
      type: "TEXT",
      characters: n.textData?.characters ?? "",
      textStyle,
    };
  }

  if (type === "INSTANCE") {
    return {
      ...base,
      type: "INSTANCE",
      componentId: n.symbolData?.symbolID
        ? guidToString(n.symbolData.symbolID)
        : undefined,
      componentKey: n.componentKey,
    };
  }

  if (type === "COMPONENT") {
    return {
      ...base,
      type: "COMPONENT",
      componentKey: n.componentKey,
    };
  }

  return base;
}

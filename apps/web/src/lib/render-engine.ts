/**
 * High-performance canvas scene renderer for SigmaDesign documents.
 *
 * Designed for large design-system scenes (tens of thousands of nodes):
 * - Viewport culling + depth/draw budgets
 * - Path2D + color caches
 * - Images with blend modes (e.g. multiply QR codes) and safe clipping
 * - Lucide-style stroke centerlines vs expanded stroke outlines
 * - Multi-layer drop shadows
 *
 * Called each rAF from Canvas.tsx; keep pure (no React) for testability.
 */
import type { AlteronDocument, NodeId, SceneNode } from "@alteron/document-model";
import { canvasFontFromTextStyle } from "./design-fonts";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── caches ──────────────────────────────────────────────────────────
const pathCache = new Map<string, Path2D>();
const colorCache = new Map<string, string>();
const imageCache = new Map<string, HTMLImageElement>();
const loadingImages = new Set<string>();

export function clearRenderCaches() {
  pathCache.clear();
  colorCache.clear();
}

function getPath2D(key: string, d: string): Path2D {
  let p = pathCache.get(key);
  if (!p) {
    try {
      p = new Path2D(d);
    } catch {
      p = new Path2D();
    }
    pathCache.set(key, p);
    // bound cache size
    if (pathCache.size > 20_000) {
      const first = pathCache.keys().next().value;
      if (first) pathCache.delete(first);
    }
  }
  return p;
}

function rgbaCss(
  c: { r: number; g: number; b: number; a?: number },
  opacity = 1
): string {
  const a = (c.a ?? 1) * opacity;
  const key = `${c.r},${c.g},${c.b},${a}`;
  let css = colorCache.get(key);
  if (!css) {
    css = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
    colorCache.set(key, css);
  }
  return css;
}

function solidColor(
  paints: SceneNode["fills"],
  fallback: string | null = null
): string | null {
  for (const p of paints) {
    if (p.visible === false || p.type !== "SOLID") continue;
    const solid = p as {
      type: "SOLID";
      color?: { r: number; g: number; b: number; a?: number };
      opacity?: number;
      visible?: boolean;
    };
    const c = solid.color;
    if (!c) continue;
    const a = (c.a ?? 1) * (solid.opacity ?? 1);
    if (a <= 0) continue;
    return rgbaCss(c, solid.opacity ?? 1);
  }
  return fallback;
}

type MatLike = {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
};

function invertMat2D(m: MatLike): MatLike | null {
  const det = m.m00 * m.m11 - m.m01 * m.m10;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return {
    m00: m.m11 * inv,
    m01: -m.m01 * inv,
    m02: (m.m01 * m.m12 - m.m11 * m.m02) * inv,
    m10: -m.m10 * inv,
    m11: m.m00 * inv,
    m12: (m.m10 * m.m02 - m.m00 * m.m12) * inv,
  };
}

function applyMat(m: MatLike, x: number, y: number) {
  return {
    x: m.m00 * x + m.m01 * y + m.m02,
    y: m.m10 * x + m.m11 * y + m.m12,
  };
}

/** Build canvas paint for SOLID or GRADIENT fills (Figma gradientTransform). */
function paintStyle(
  ctx: CanvasRenderingContext2D,
  paint: SceneNode["fills"][number],
  b: { x: number; y: number; width: number; height: number }
): string | CanvasGradient | null {
  if (paint.visible === false) return null;
  const opacity = paint.opacity ?? 1;
  if (opacity <= 0) return null;

  if (paint.type === "SOLID") {
    const solid = paint as {
      type: "SOLID";
      color?: { r: number; g: number; b: number; a?: number };
      opacity?: number;
    };
    if (!solid.color) return null;
    return rgbaCss(solid.color, opacity);
  }

  if (
    paint.type === "GRADIENT_LINEAR" ||
    paint.type === "GRADIENT_RADIAL" ||
    paint.type === "GRADIENT_ANGULAR" ||
    paint.type === "GRADIENT_DIAMOND"
  ) {
    const g = paint as {
      type: string;
      stops?: Array<{
        color: { r: number; g: number; b: number; a?: number };
        position: number;
      }>;
      transform?: MatLike;
      opacity?: number;
    };
    const stops = g.stops ?? [];
    if (!stops.length) return null;

    const w = Math.max(b.width, 1e-6);
    const h = Math.max(b.height, 1e-6);
    let x0 = b.x;
    let y0 = b.y + h / 2;
    let x1 = b.x + w;
    let y1 = b.y + h / 2;

    if (g.transform) {
      const inv = invertMat2D(g.transform);
      if (inv) {
        // Figma: gradient line is (0,0.5)→(1,0.5) in gradient space; inv maps to unit box
        const p0 = applyMat(inv, 0, 0.5);
        const p1 = applyMat(inv, 1, 0.5);
        x0 = b.x + p0.x * w;
        y0 = b.y + p0.y * h;
        x1 = b.x + p1.x * w;
        y1 = b.y + p1.y * h;
      }
    }

    let grad: CanvasGradient;
    if (paint.type === "GRADIENT_RADIAL" || paint.type === "GRADIENT_DIAMOND") {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const r = Math.hypot(x1 - x0, y1 - y0) / 2 || Math.max(w, h) / 2;
      grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    } else {
      // LINEAR + ANGULAR approximated as linear along transform axis
      grad = ctx.createLinearGradient(x0, y0, x1, y1);
    }
    for (const s of stops) {
      const pos = Math.min(1, Math.max(0, s.position ?? 0));
      grad.addColorStop(pos, rgbaCss(s.color, opacity));
    }
    return grad;
  }

  return null;
}

/** Paint all non-image fills (solids + gradients) into the current path or a rounded rect. */
function fillAllPaints(
  ctx: CanvasRenderingContext2D,
  paints: SceneNode["fills"],
  b: { x: number; y: number; width: number; height: number },
  radii: { tl: number; tr: number; br: number; bl: number },
  options?: { useCurrentPath?: boolean }
): boolean {
  let drew = false;
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === "IMAGE") continue;
    const style = paintStyle(ctx, p, b);
    if (!style) continue;
    ctx.fillStyle = style;
    if (!options?.useCurrentPath) {
      roundRect(ctx, b.x, b.y, b.width, b.height, radii);
    }
    ctx.fill();
    drew = true;
  }
  return drew;
}

type Radii = number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };

function radiiOf(node: SceneNode): {
  tl: number;
  tr: number;
  br: number;
  bl: number;
} {
  if (node.cornerRadius == null) return { tl: 0, tr: 0, br: 0, bl: 0 };
  if (typeof node.cornerRadius === "number") {
    const r = node.cornerRadius;
    return { tl: r, tr: r, br: r, bl: r };
  }
  return {
    tl: node.cornerRadius.topLeft ?? 0,
    tr: node.cornerRadius.topRight ?? 0,
    br: node.cornerRadius.bottomRight ?? 0,
    bl: node.cornerRadius.bottomLeft ?? 0,
  };
}

/** @deprecated use radiiOf + roundRectRadii */
function radiusOf(node: SceneNode): number {
  const r = radiiOf(node);
  return Math.max(r.tl, r.tr, r.br, r.bl);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | { tl: number; tr: number; br: number; bl: number }
) {
  const rr =
    typeof r === "number"
      ? { tl: r, tr: r, br: r, bl: r }
      : r;
  const tl = Math.min(Math.max(rr.tl, 0), w / 2, h / 2);
  const tr = Math.min(Math.max(rr.tr, 0), w / 2, h / 2);
  const br = Math.min(Math.max(rr.br, 0), w / 2, h / 2);
  const bl = Math.min(Math.max(rr.bl, 0), w / 2, h / 2);
  ctx.beginPath();
  if (tl <= 0.5 && tr <= 0.5 && br <= 0.5 && bl <= 0.5) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
  else ctx.lineTo(x, y);
  ctx.closePath();
}

function intersects(
  b: { x: number; y: number; width: number; height: number },
  v: ViewBounds,
  pad = 0
): boolean {
  return !(
    b.x + b.width < v.x - pad ||
    b.x > v.x + v.w + pad ||
    b.y + b.height < v.y - pad ||
    b.y > v.y + v.h + pad
  );
}

function fullyOutside(
  b: { x: number; y: number; width: number; height: number },
  v: ViewBounds
): boolean {
  return (
    b.x + b.width < v.x ||
    b.x > v.x + v.w ||
    b.y + b.height < v.y ||
    b.y > v.y + v.h
  );
}

function loadImage(src: string, onLoad: () => void) {
  if (imageCache.has(src) || loadingImages.has(src)) return;
  loadingImages.add(src);
  const img = new Image();
  // Decode at full resolution for crisp logos when scaled
  img.decoding = "async";
  img.onload = () => {
    imageCache.set(src, img);
    loadingImages.delete(src);
    onLoad();
  };
  img.onerror = () => loadingImages.delete(src);
  img.src = src;
}

/**
 * Draw image into dest rect using Figma image scale modes.
 * FILL = cover (crop), FIT = contain, STRETCH/CROP/TILE ≈ stretch fill.
 */
function drawImageScaled(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  scaleMode: string
) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const mode = (scaleMode || "FILL").toUpperCase();

  if (mode === "STRETCH" || mode === "CROP") {
    // CROP in Figma often still uses imageTransform; without it, stretch to frame
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }

  if (mode === "TILE") {
    const pat = ctx.createPattern(img, "repeat");
    if (pat) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    return;
  }

  // FILL (cover) or FIT (contain)
  const scale =
    mode === "FIT"
      ? Math.min(dw / iw, dh / ih)
      : Math.max(dw / iw, dh / ih); // FILL default
  const sw = iw * scale;
  const sh = ih * scale;
  const ox = dx + (dw - sw) / 2;
  const oy = dy + (dh - sh) / 2;
  ctx.drawImage(img, ox, oy, sw, sh);
}

function isMaskGroup(node: SceneNode): boolean {
  const n = (node.name || "").toLowerCase();
  return n === "mask group" || n.endsWith("mask group") || n === "mask";
}

function mapLineCap(cap?: string): CanvasLineCap {
  if (cap === "ROUND") return "round";
  if (cap === "SQUARE") return "square";
  return "butt";
}
function mapLineJoin(join?: string): CanvasLineJoin {
  if (join === "ROUND") return "round";
  if (join === "BEVEL") return "bevel";
  return "miter";
}

function clearCanvasShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function listDropShadows(node: SceneNode) {
  return (node.effects ?? []).filter(
    (e) => e.visible !== false && e.type === "DROP_SHADOW"
  );
}

/** Apply one Figma DROP_SHADOW to the canvas state. */
function applyOneDropShadow(
  ctx: CanvasRenderingContext2D,
  e: NonNullable<SceneNode["effects"]>[number]
) {
  const c = e.color;
  if (c) {
    const a = c.a ?? 1;
    // Slightly boost alpha so soft design-system shadows remain visible on canvas
    const aa = Math.min(1, a * 1.35);
    ctx.shadowColor = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${aa})`;
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.14)";
  }
  // Canvas has no true spread — approximate: positive spread widens blur,
  // negative (common in DS cards) still keeps a readable soft edge.
  const radius = e.radius ?? 0;
  const spread = e.spread ?? 0;
  ctx.shadowBlur = Math.max(0.5, radius + Math.max(spread, -radius * 0.5));
  ctx.shadowOffsetX = e.offset?.x ?? 0;
  ctx.shadowOffsetY = e.offset?.y ?? 0;
}

/**
 * Draw an opaque silhouette once per drop-shadow, then again clean.
 * Canvas only supports one live shadow; multi-shadow DS cards need stacking.
 */
function drawWithDropShadows(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  drawOpaque: () => void
) {
  const shadows = listDropShadows(node);
  if (!shadows.length) {
    clearCanvasShadow(ctx);
    drawOpaque();
    return;
  }
  for (const s of shadows) {
    ctx.save();
    applyOneDropShadow(ctx, s);
    drawOpaque();
    ctx.restore();
  }
  clearCanvasShadow(ctx);
  drawOpaque();
}

export interface RenderStats {
  drawn: number;
  culled: number;
  ms: number;
}

/**
 * Draw the current page into ctx. ctx is already in screen space (dpr applied).
 * Caller applies viewport translate/scale before calling, OR pass applyViewport=true.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  doc: AlteronDocument,
  viewport: Viewport,
  screenW: number,
  screenH: number,
  options?: {
    selection?: NodeId[];
    onImageLoad?: () => void;
  }
): RenderStats {
  const t0 = performance.now();
  const { x: vx, y: vy, zoom } = viewport;
  const invZ = 1 / zoom;
  const viewBounds: ViewBounds = {
    x: -vx * invZ,
    y: -vy * invZ,
    w: screenW * invZ,
    h: screenH * invZ,
  };

  // High-quality raster/text when zoomed in (logos, icons)
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    (ctx as CanvasRenderingContext2D & { imageSmoothingQuality: string }).imageSmoothingQuality =
      "high";
  }

  // LOD thresholds in world units — higher budgets so dense UI (sidebars) fully draws
  const minFeature = 0.5 * invZ; // skip detail under ~0.5 screen px
  const textMin = 3 * invZ;
  const vectorMin = 1.25 * invZ;
  const maxDepth = zoom < 0.08 ? 16 : zoom < 0.2 ? 24 : zoom < 0.5 ? 36 : 64;
  const maxDraw =
    zoom < 0.1 ? 8_000 : zoom < 0.25 ? 20_000 : zoom < 0.6 ? 40_000 : 80_000;

  let drawn = 0;
  let culled = 0;

  const page = doc.pages.find((p) => p.id === doc.currentPageId);
  if (!page) {
    return { drawn: 0, culled: 0, ms: performance.now() - t0 };
  }

  ctx.save();
  ctx.translate(vx, vy);
  ctx.scale(zoom, zoom);

  const onImageLoad = options?.onImageLoad;

  const walk = (ids: NodeId[], depth: number) => {
    if (depth > maxDepth || drawn >= maxDraw) return;

    for (let i = 0; i < ids.length; i++) {
      if (drawn >= maxDraw) return;
      const id = ids[i]!;
      const node = doc.nodes[id];
      if (!node || node.visible === false) continue;

      // Path/stroke geometry must never be culled by area — Lucide plus arms are
      // 0×N / N×0 vectors whose AABB area is zero but they still paint.
      const hasGeom =
        (node.fillPaths?.length ?? 0) > 0 ||
        (node.strokePaths?.length ?? 0) > 0 ||
        node.type === "LINE" ||
        (node.strokeWeight ?? 0) > 0 && (node.strokes?.some((s) => s.visible !== false) ?? false);

      const b = node.absoluteBounds;
      if (b) {
        // Skip entire subtree if completely outside viewport
        // Expand cull pad slightly for stroke-expanded geometry / zero-axis vectors
        const pad = Math.max(node.strokeWeight ?? 0, hasGeom ? 2 : 0);
        if (
          depth > 0 &&
          fullyOutside(
            {
              x: b.x - pad,
              y: b.y - pad,
              width: b.width + pad * 2,
              height: b.height + pad * 2,
            },
            viewBounds
          )
        ) {
          culled++;
          continue;
        }
        // Tiny on screen: skip drawing empty containers (keep path/icon nodes)
        const screenArea = b.width * b.height * zoom * zoom;
        const screenMax = Math.max(b.width, b.height) * zoom;
        if (depth > 2 && screenArea < 0.5 && screenMax < 0.5 && !hasGeom) {
          culled++;
          continue;
        }
      }

      if (isMaskGroup(node) && node.children.length >= 2) {
        drawn += drawMaskGroup(ctx, doc, node, viewBounds, zoom, onImageLoad);
        continue;
      }

      // Draw self — never skip detail for nodes with vector geometry
      const skipDetail =
        !hasGeom &&
        b != null &&
        (b.width < minFeature || b.height < minFeature) &&
        depth > 1;

      if (!skipDetail) {
        drawNode(ctx, doc, node, zoom, textMin, vectorMin, onImageLoad);
        drawn++;
      } else if (b && b.width * zoom > 0.5 && b.height * zoom > 0.5) {
        // flat color placeholder
        const fill = solidColor(node.fills);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fillRect(b.x, b.y, Math.max(b.width, invZ), Math.max(b.height, invZ));
          drawn++;
        } else {
          culled++;
        }
        continue; // don't descend
      } else {
        culled++;
        continue;
      }

      if (!node.children.length) continue;
      if (depth >= maxDepth) continue;

      // Don't descend into tiny empty containers (but always enter icon/instance hosts)
      if (
        b &&
        b.width * zoom < 3 &&
        b.height * zoom < 3 &&
        depth > 1 &&
        !hasGeom &&
        node.type !== "INSTANCE" &&
        node.type !== "COMPONENT"
      )
        continue;

      // Only clip when Figma explicitly wants it (frameMaskDisabled=false → clipsContent true).
      // Using `!== false` was over-clipping and shaved stroke icons / shadows.
      const clip =
        node.clipsContent === true &&
        (node.type === "FRAME" ||
          node.type === "COMPONENT" ||
          node.type === "INSTANCE" ||
          node.type === "SECTION") &&
        b &&
        b.width > 1 &&
        b.height > 1 &&
        zoom > 0.05;

      if (clip) {
        ctx.save();
        roundRect(ctx, b!.x, b!.y, b!.width, b!.height, radiiOf(node));
        ctx.clip();
        walk(node.children, depth + 1);
        ctx.restore();
      } else {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(page.children, 0);

  // Selection (cheap)
  const selection = options?.selection;
  if (selection?.length) {
    for (const sid of selection) {
      const n = doc.nodes[sid];
      const b = n?.absoluteBounds;
      if (!b) continue;
      ctx.strokeStyle = "#0d99ff";
      ctx.lineWidth = 1.5 * invZ;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      const hs = 6 * invZ;
      ctx.fillStyle = "#fff";
      for (const [hx, hy] of [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height],
      ] as const) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
    }
  }

  ctx.restore();
  return { drawn, culled, ms: performance.now() - t0 };
}

function drawMaskGroup(
  ctx: CanvasRenderingContext2D,
  doc: AlteronDocument,
  group: SceneNode,
  _view: ViewBounds,
  zoom: number,
  onImageLoad?: () => void
): number {
  const children = group.children
    .map((id) => doc.nodes[id])
    .filter((n): n is SceneNode => Boolean(n) && n.visible !== false);
  if (!children.length) return 0;

  // Prefer explicit Figma mask flag; fall back to heuristics
  let mask =
    children.find((c) => c.isMask) ||
    children.find(
      (c) =>
        c.fills?.some((f) => f.type === "IMAGE" && f.visible !== false) &&
        children.some(
          (o) =>
            o.id !== c.id &&
            o.fills?.some((f) => f.type === "SOLID" && f.visible !== false)
        )
    ) ||
    children.find(
      (c) =>
        !c.fills?.some((f) => f.type === "IMAGE" && f.visible !== false) &&
        (c.type === "RECTANGLE" || c.type === "ELLIPSE" || c.type === "VECTOR")
    ) ||
    children[children.length - 1]!;

  const content = children.filter((c) => c.id !== mask.id);
  const mb = mask.absoluteBounds || group.absoluteBounds;
  if (!mb) return 0;

  // Offscreen layer: paint content, then destination-in with the mask alpha.
  // This correctly recolors white logos (image mask + solid fill content).
  const pad = 2;
  const w = Math.max(1, Math.ceil(mb.width + pad * 2));
  const h = Math.max(1, Math.ceil(mb.height + pad * 2));
  // Avoid huge offscreen buffers for oversized mask groups
  if (w * h > 4_000_000) {
    ctx.save();
    roundRect(ctx, mb.x, mb.y, Math.max(mb.width, 1), Math.max(mb.height, 1), radiiOf(mask));
    ctx.clip();
    for (const c of content) drawNode(ctx, doc, c, zoom, 0, 0, onImageLoad);
    ctx.restore();
    return content.length || 1;
  }

  const layer = document.createElement("canvas");
  layer.width = w;
  layer.height = h;
  const lctx = layer.getContext("2d");
  if (!lctx) return 0;

  lctx.translate(-mb.x + pad, -mb.y + pad);

  // 1) Content (solids / images / vectors that should appear)
  const list =
    content.length > 0
      ? content
      : children.filter((c) => c.id !== mask.id);
  for (const c of list) {
    drawNode(lctx as unknown as CanvasRenderingContext2D, doc, c, zoom, 0, 0, onImageLoad);
  }

  // 2) Mask alpha: keep content only where mask is opaque
  lctx.globalCompositeOperation = "destination-in";
  drawNode(lctx as unknown as CanvasRenderingContext2D, doc, mask, zoom, 0, 0, onImageLoad);

  ctx.drawImage(layer, mb.x - pad, mb.y - pad);
  return list.length || 1;
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  doc: AlteronDocument,
  node: SceneNode,
  zoom: number,
  textMin: number,
  vectorMin: number,
  onImageLoad?: () => void
) {
  const b = node.absoluteBounds;
  if (!b) return;

  const hasPaths =
    (node.fillPaths && node.fillPaths.length > 0) ||
    (node.strokePaths && node.strokePaths.length > 0);

  if (!hasPaths && node.type !== "LINE" && b.width <= 0 && b.height <= 0) return;

  const fill = solidColor(node.fills);
  const stroke = solidColor(node.strokes);
  const radii = radiiOf(node);
  const r = Math.max(radii.tl, radii.tr, radii.br, radii.bl);
  const opacity = node.opacity ?? 1;
  const abs = node.absoluteTransform;

  // Detect reflection / rotation (non-axis-aligned positive scale)
  const hasComplexXform =
    abs &&
    (Math.abs(abs.m01) > 1e-6 ||
      Math.abs(abs.m10) > 1e-6 ||
      abs.m00 < -1e-6 ||
      abs.m11 < -1e-6);

  if (opacity < 0.01) return;

  // Isolate alpha + shadow per node (shadow must not leak to siblings)
  ctx.save();
  if (opacity < 0.999) ctx.globalAlpha *= opacity;

  // For flipped/rotated nodes, draw in local space via absolute matrix
  if (hasComplexXform && abs) {
    ctx.transform(abs.m00, abs.m10, abs.m01, abs.m11, abs.m02, abs.m12);
    // Draw in local coordinates (0,0)-(w,h)
    const localB = { x: 0, y: 0, width: node.size.width, height: node.size.height };
    drawNodeLocal(ctx, doc, node, localB, fill, stroke, radii, r, zoom, textMin, vectorMin, onImageLoad);
    ctx.restore();
    return;
  }

  drawNodeLocal(
    ctx,
    doc,
    node,
    b,
    fill,
    stroke,
    radii,
    r,
    zoom,
    textMin,
    vectorMin,
    onImageLoad
  );
  ctx.restore();
}

/** Draw node content into bounds `b` (world AABB or local 0..size when matrix applied). */
function drawNodeLocal(
  ctx: CanvasRenderingContext2D,
  doc: AlteronDocument,
  node: SceneNode,
  b: { x: number; y: number; width: number; height: number },
  fill: string | null,
  stroke: string | null,
  radii: { tl: number; tr: number; br: number; bl: number },
  r: number,
  zoom: number,
  textMin: number,
  vectorMin: number,
  onImageLoad?: () => void
) {
  const hasPaths =
    (node.fillPaths && node.fillPaths.length > 0) ||
    (node.strokePaths && node.strokePaths.length > 0);
  const hasImageFill = node.fills.some(
    (p) => p.type === "IMAGE" && p.visible !== false
  );
  const shadows = listDropShadows(node);

  /**
   * Paint fills bottom→top (Figma REST: first paint is topmost → iterate reverse).
   * Images are never covered by shadow silhouettes; blend modes are honoured.
   */
  const paintFillsBottomToTop = (): boolean => {
    let drewImage = false;
    for (let i = node.fills.length - 1; i >= 0; i--) {
      const p = node.fills[i]!;
      if (p.visible === false) continue;

      if (p.type === "IMAGE") {
        const ok = drawImagePaint(ctx, doc, node, b, radii, p, onImageLoad);
        if (ok) drewImage = true;
        continue;
      }

      const st = paintStyle(ctx, p, b);
      if (!st) continue;
      ctx.save();
      if (node.fillPaths && node.fillPaths.length > 0) {
        if (typeof st === "string") {
          drawVectorPaths(ctx, node, b, st, null);
        } else {
          // Gradient into geometry
          if (clipToFillPathsSafe(ctx, node, b, radii)) {
            ctx.fillStyle = st;
            ctx.fillRect(b.x, b.y, Math.max(b.width, 1), Math.max(b.height, 1));
          }
        }
      } else {
        ctx.fillStyle = st;
        roundRect(ctx, b.x, b.y, b.width, b.height, radii);
        ctx.fill();
      }
      ctx.restore();
    }
    return drewImage;
  };

  // ── Nodes with path geometry (most frames/images in .fig) ─────────────
  if (hasPaths) {
    const screenW = b.width * zoom;
    const screenH = b.height * zoom;
    const detailOk =
      screenW >= vectorMin ||
      screenH >= vectorMin ||
      (node.strokeWeight ?? 0) > 0 ||
      hasImageFill;

    if (detailOk) {
      // Shadow silhouette: only when there is geometry, a shadow, and NO image
      // (white silhouette used to cover login hero photos).
      const needsShadowSilhouette =
        shadows.length > 0 &&
        (node.fillPaths?.length ?? 0) > 0 &&
        !hasImageFill &&
        !fill;

      if (needsShadowSilhouette) {
        drawWithDropShadows(ctx, node, () => {
          drawVectorPaths(ctx, node, b, "rgba(255,255,255,1)", null);
        });
      } else if (shadows.length > 0 && hasImageFill) {
        // Cast shadow from the image/shape, then paint clean on top
        drawWithDropShadows(ctx, node, () => {
          paintFillsBottomToTop();
        });
      } else if (shadows.length > 0 && fill && (node.fillPaths?.length ?? 0) > 0) {
        drawWithDropShadows(ctx, node, () => {
          paintFillsBottomToTop();
        });
      } else {
        clearCanvasShadow(ctx);
        paintFillsBottomToTop();
      }

      // Stroke outlines (borders) after fills/images
      if (stroke && (node.strokePaths?.length ?? 0) > 0) {
        clearCanvasShadow(ctx);
        drawVectorPaths(ctx, node, b, null, stroke);
      } else if (
        stroke &&
        (node.strokeWeight || 0) > 0 &&
        (node.fillPaths?.length ?? 0) > 0 &&
        !(node.strokePaths?.length)
      ) {
        clearCanvasShadow(ctx);
        drawVectorPaths(ctx, node, b, null, stroke);
      }
    }
    return;
  }

  // ── No path geometry: images + rounded-rect body ──────────────────────
  let drewImage = false;
  if (hasImageFill) {
    const drawImgs = () => {
      for (let i = node.fills.length - 1; i >= 0; i--) {
        const p = node.fills[i]!;
        if (p.type !== "IMAGE" || p.visible === false) continue;
        if (drawImagePaint(ctx, doc, node, b, radii, p, onImageLoad)) {
          drewImage = true;
        }
      }
    };
    if (shadows.length) drawWithDropShadows(ctx, node, drawImgs);
    else {
      clearCanvasShadow(ctx);
      drawImgs();
    }
  }

  if (node.type === "ELLIPSE") {
    const drawEllipse = () => {
      ctx.beginPath();
      ctx.ellipse(
        b.x + b.width / 2,
        b.y + b.height / 2,
        Math.max(0.5, b.width / 2),
        Math.max(0.5, b.height / 2),
        0,
        0,
        Math.PI * 2
      );
      let filled = false;
      for (const p of node.fills) {
        if (p.visible === false || p.type === "IMAGE") continue;
        const st = paintStyle(ctx, p, b);
        if (!st) continue;
        ctx.fillStyle = st;
        ctx.fill();
        filled = true;
      }
      if (!filled && fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
    };
    drawWithDropShadows(ctx, node, drawEllipse);
    if (stroke && (node.strokeWeight ?? 0) > 0) {
      clearCanvasShadow(ctx);
      ctx.beginPath();
      ctx.ellipse(
        b.x + b.width / 2,
        b.y + b.height / 2,
        Math.max(0.5, b.width / 2),
        Math.max(0.5, b.height / 2),
        0,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = stroke;
      ctx.lineWidth = node.strokeWeight || 1;
      ctx.stroke();
    }
  } else if (node.type === "LINE") {
    clearCanvasShadow(ctx);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.width, b.y + b.height);
    ctx.strokeStyle = stroke ?? fill ?? "rgba(255,255,255,0.4)";
    ctx.lineWidth = Math.max(1, node.strokeWeight || 1);
    ctx.stroke();
  } else if (node.type === "TEXT" && "characters" in node) {
    clearCanvasShadow(ctx);
    if (b.height * zoom >= textMin || (node.textStyle?.fontSize ?? 12) * zoom >= textMin) {
      drawText(ctx, node, b, fill);
    }
  } else if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
    drawWithDropShadows(ctx, node, () => fillAllPaints(ctx, node.fills, b, radii));
  } else {
    // FRAME / RECTANGLE / GROUP / INSTANCE body fills (under children)
    const drawBody = () => {
      if (!drewImage) {
        fillAllPaints(ctx, node.fills, b, radii);
      } else {
        for (const p of node.fills) {
          if (p.visible === false || p.type === "IMAGE") continue;
          const st = paintStyle(ctx, p, b);
          if (!st) continue;
          ctx.fillStyle = st;
          roundRect(ctx, b.x, b.y, b.width, b.height, radii);
          ctx.fill();
        }
      }
    };
    if (listDropShadows(node).length && (fill || drewImage || node.fills.some((p) => p.visible !== false && p.type !== "IMAGE"))) {
      drawWithDropShadows(ctx, node, drawBody);
    } else {
      clearCanvasShadow(ctx);
      drawBody();
    }
    if (stroke && (node.strokeWeight ?? 0) > 0) {
      clearCanvasShadow(ctx);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = node.strokeWeight || 1;
      const inset =
        node.strokeAlign === "INSIDE"
          ? (node.strokeWeight || 1) / 2
          : node.strokeAlign === "OUTSIDE"
            ? -(node.strokeWeight || 1) / 2
            : 0;
      if (r > 0.5 || inset !== 0) {
        roundRect(
          ctx,
          b.x + inset,
          b.y + inset,
          Math.max(b.width - inset * 2, 0),
          Math.max(b.height - inset * 2, 0),
          radii
        );
        ctx.stroke();
      } else {
        ctx.strokeRect(b.x, b.y, b.width, b.height);
      }
    }
  }
}

function mapComposite(
  blend?: string
): GlobalCompositeOperation | null {
  if (!blend || blend === "NORMAL" || blend === "PASS_THROUGH") return null;
  const m: Record<string, GlobalCompositeOperation> = {
    MULTIPLY: "multiply",
    SCREEN: "screen",
    OVERLAY: "overlay",
    DARKEN: "darken",
    LIGHTEN: "lighten",
    COLOR_DODGE: "color-dodge",
    COLOR_BURN: "color-burn",
    HARD_LIGHT: "hard-light",
    SOFT_LIGHT: "soft-light",
    DIFFERENCE: "difference",
    EXCLUSION: "exclusion",
    HUE: "hue",
    SATURATION: "saturation",
    COLOR: "color",
    LUMINOSITY: "luminosity",
  };
  return m[blend] ?? null;
}

/**
 * Safe clip to fillPaths (or rounded bounds). Returns false if clipping failed
 * so callers can skip drawing rather than painting into an empty clip.
 */
function clipToFillPathsSafe(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  b: { x: number; y: number; width: number; height: number },
  radii: { tl: number; tr: number; br: number; bl: number }
): boolean {
  try {
    if (!node.fillPaths?.length) {
      roundRect(ctx, b.x, b.y, Math.max(b.width, 1), Math.max(b.height, 1), radii);
      ctx.clip();
      return true;
    }
    const sw = node.size.width;
    const sh = node.size.height;
    const designW = sw > 1e-6 ? sw : Math.max(b.width, 1e-6);
    const designH = sh > 1e-6 ? sh : Math.max(b.height, 1e-6);
    const sx = designW > 1e-6 ? b.width / designW : 1;
    const sy = designH > 1e-6 ? b.height / designH : 1;

    // Prefer simple bounds clip for full-frame rects (photos, QR codes) —
    // Path2D clip + addPath is fragile and can yield an empty clip.
    const d0 = node.fillPaths[0]?.d ?? "";
    const simpleRect =
      node.fillPaths.length === 1 &&
      /^M[\s,]*0[\s,]+0[\s,]+L[\s,]*[\d.]+[\s,]+0[\s,]+L[\s,]*[\d.]+[\s,]+[\d.]+[\s,]+L[\s,]*0[\s,]+[\d.]+/i.test(
        d0.replace(/\s+/g, " ").trim()
      );
    if (simpleRect) {
      roundRect(ctx, b.x, b.y, Math.max(b.width, 1), Math.max(b.height, 1), radii);
      ctx.clip();
      return true;
    }

    ctx.translate(b.x, b.y);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    // Clip first subpath only (avoid Path2D.addPath portability issues)
    const path = getPath2D(`${node.id}:f:0`, node.fillPaths[0]!.d);
    ctx.clip(path);
    if (sx !== 1 || sy !== 1) ctx.scale(1 / sx, 1 / sy);
    ctx.translate(-b.x, -b.y);
    return true;
  } catch {
    try {
      roundRect(ctx, b.x, b.y, Math.max(b.width, 1), Math.max(b.height, 1), radii);
      ctx.clip();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Draw a single IMAGE paint. Returns true if pixels were drawn.
 * Handles multiply blend (common on QR/codes) with a white underlay so the
 * pattern stays visible on dark canvas backgrounds.
 */
function drawImagePaint(
  ctx: CanvasRenderingContext2D,
  doc: AlteronDocument,
  node: SceneNode,
  b: { x: number; y: number; width: number; height: number },
  radii: { tl: number; tr: number; br: number; bl: number },
  paint: {
    type: string;
    imageHash?: string;
    opacity?: number;
    scaleMode?: string;
    blendMode?: string;
  },
  onImageLoad?: () => void
): boolean {
  if (!paint.imageHash) return false;
  const asset = doc.assets[paint.imageHash];
  if (!asset?.dataUrl) return false;
  const img = imageCache.get(asset.dataUrl);
  if (!img) {
    if (onImageLoad) loadImage(asset.dataUrl, onImageLoad);
    return false;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    (
      ctx as CanvasRenderingContext2D & { imageSmoothingQuality: string }
    ).imageSmoothingQuality = "high";
  }
  if ((paint.opacity ?? 1) < 0.999) ctx.globalAlpha *= paint.opacity ?? 1;

  // Always clip to node bounds (safe). Path clip is optional enhancement.
  if (!clipToFillPathsSafe(ctx, node, b, radii)) {
    ctx.restore();
    return false;
  }

  const blend = mapComposite(paint.blendMode);
  // Multiply/darken QR codes need a light underlay so black modules read
  // against whatever is behind (parent card or canvas chrome).
  if (
    blend === "multiply" ||
    blend === "darken" ||
    blend === "color-burn"
  ) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(b.x, b.y, Math.max(b.width, 1), Math.max(b.height, 1));
  }

  if (blend) ctx.globalCompositeOperation = blend;

  drawImageScaled(
    ctx,
    img,
    b.x,
    b.y,
    Math.max(b.width, 1),
    Math.max(b.height, 1),
    paint.scaleMode || "FILL"
  );
  ctx.restore();
  return true;
}

/**
 * Draw vector geometry.
 *
 * Coordinate spaces:
 * - fillGeometry / expanded strokeGeometry → node.size space
 * - vector-network centerlines (paint:"stroke") → vectorNormalizedSize space
 *
 * Expanded strokeGeometry is filled with the stroke paint (never restroked).
 * Centerlines use canvas stroke() with strokeWeight / scale.
 */
function drawVectorPaths(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  b: { x: number; y: number; width: number; height: number },
  fill: string | null,
  stroke: string | null
) {
  const sw = node.size.width;
  const sh = node.size.height;
  const vns = node.vectorNormalizedSize;
  const hasCenterline = (node.strokePaths ?? []).some((p) => p.paint === "stroke");
  const hasOutline = (node.strokePaths ?? []).some((p) => p.paint !== "stroke");
  const hasFillGeom = (node.fillPaths?.length ?? 0) > 0;

  // Geometry (fills + expanded stroke outlines) lives in size space.
  // Centerlines live in vectorNormalizedSize (Figma network space).
  const geomW = sw > 1e-6 || sh > 1e-6 ? sw : (vns?.width ?? Math.max(b.width, 1e-6));
  const geomH = sw > 1e-6 || sh > 1e-6 ? sh : (vns?.height ?? Math.max(b.height, 1e-6));
  const netW = vns?.width && vns.width > 1e-6 ? vns.width : geomW;
  const netH = vns?.height && vns.height > 1e-6 ? vns.height : geomH;

  const dw = Math.max(b.width, 0);
  const dh = Math.max(b.height, 0);

  const scaleFor = (designW: number, designH: number) => {
    const sx = designW > 1e-6 ? dw / designW : 1;
    const sy = designH > 1e-6 ? dh / designH : 1;
    return { sx, sy, avg: Math.max((Math.abs(sx) + Math.abs(sy)) / 2, 1e-6) };
  };

  // 1) fillPaths in geometry/size space
  if (hasFillGeom && fill) {
    const { sx, sy } = scaleFor(geomW, geomH);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    for (let i = 0; i < (node.fillPaths?.length ?? 0); i++) {
      const p = node.fillPaths![i]!;
      const path = getPath2D(`${node.id}:f:${i}`, p.d);
      ctx.fillStyle = fill;
      ctx.fill(path, p.windingRule === "evenodd" ? "evenodd" : "nonzero");
    }
    ctx.restore();
  }

  // 2) strokePaths — outline fill vs centerline stroke (possibly different spaces)
  if (hasOutline && stroke) {
    const { sx, sy } = scaleFor(geomW, geomH);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    for (let i = 0; i < (node.strokePaths?.length ?? 0); i++) {
      const p = node.strokePaths![i]!;
      if (p.paint === "stroke") continue;
      const path = getPath2D(`${node.id}:s:${i}`, p.d);
      ctx.fillStyle = stroke;
      ctx.fill(path, p.windingRule === "evenodd" ? "evenodd" : "nonzero");
    }
    ctx.restore();
  }

  if (hasCenterline) {
    const strokeColor = stroke ?? fill;
    if (strokeColor) {
      const { sx, sy, avg } = scaleFor(netW, netH);
      ctx.save();
      ctx.translate(b.x, b.y);
      if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = (node.strokeWeight || 1.5) / avg;
      ctx.lineCap = mapLineCap(node.strokeCap || "ROUND");
      ctx.lineJoin = mapLineJoin(node.strokeJoin || "ROUND");
      for (let i = 0; i < (node.strokePaths?.length ?? 0); i++) {
        const p = node.strokePaths![i]!;
        if (p.paint !== "stroke") continue;
        const path = getPath2D(`${node.id}:s:${i}`, p.d);
        ctx.stroke(path);
      }
      ctx.restore();
    }
  }

  // 3) fill geometry + stroke paint, no strokePaths
  if (
    hasFillGeom &&
    stroke &&
    (node.strokeWeight || 0) > 0 &&
    !(node.strokePaths?.length)
  ) {
    const { sx, sy, avg } = scaleFor(geomW, geomH);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    for (let i = 0; i < (node.fillPaths?.length ?? 0); i++) {
      const p = node.fillPaths![i]!;
      const path = getPath2D(`${node.id}:f:${i}`, p.d);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = (node.strokeWeight || 1) / avg;
      ctx.lineCap = mapLineCap(node.strokeCap);
      ctx.lineJoin = mapLineJoin(node.strokeJoin);
      ctx.stroke(path);
    }
    ctx.restore();
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  b: { x: number; y: number; width: number; height: number },
  fill: string | null
) {
  if (node.type !== "TEXT" || !("characters" in node)) return;
  const ts = node.textStyle;
  const fontSize = ts?.fontSize ?? 12;
  // Per-node family + weight from design file (Geist/Inter/SF Mono/…)
  ctx.font = canvasFontFromTextStyle({
    fontFamily: ts?.fontFamily,
    fontStyle: ts?.fontStyle,
    fontSize,
  });
  ctx.fillStyle = fill ?? "rgba(15,23,42,0.95)";

  let text = String(node.characters ?? "");
  // textCase
  const tc = (ts?.textCase || "").toUpperCase();
  if (tc === "UPPER" || tc === "UPPERCASE") text = text.toUpperCase();
  else if (tc === "LOWER" || tc === "LOWERCASE") text = text.toLowerCase();
  else if (tc === "TITLE")
    text = text.replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());

  const align = (ts?.textAlignHorizontal || "LEFT").toUpperCase();
  const derived = ts?.derived;

  // Prefer Figma-computed metrics from derivedTextData
  let lineH = derived?.lineHeight ?? fontSize * 1.2;
  let lineAscent = derived?.lineAscent ?? fontSize;
  if (!derived) {
    const lh = ts?.lineHeight;
    if (typeof lh === "number") lineH = lh;
    else if (lh && typeof lh === "object") {
      if (lh.unit === "PIXELS") lineH = lh.value;
      else if (lh.unit === "PERCENT") lineH = fontSize * (lh.value / 100);
    }
    lineH = Math.max(lineH, fontSize);
    lineAscent = fontSize * 0.8;
  }

  // Letter spacing
  const ls = ts?.letterSpacing;
  let letterSpacingPx = 0;
  if (typeof ls === "number") letterSpacingPx = ls;
  else if (ls && typeof ls === "object") {
    letterSpacingPx =
      ls.unit === "PERCENT" ? fontSize * (ls.value / 100) : ls.value;
  }
  if (letterSpacingPx !== 0 && "letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${letterSpacingPx}px`;
  }

  const explicitLines = text.split("\n");
  const allowWrap =
    b.height > lineH * 1.5 ||
    (derived?.layoutHeight ?? 0) > lineH * 1.5 ||
    explicitLines.length > 1;
  const lines: string[] = [];
  if (!allowWrap) {
    lines.push(explicitLines.join(" "));
  } else {
    for (const para of explicitLines) {
      const words = para.split(/(\s+)/);
      let line = "";
      const maxW = Math.max(4, b.width);
      for (const w of words) {
        const test = line + w;
        if (ctx.measureText(test).width > maxW && line.trim().length > 0) {
          lines.push(line);
          line = w.trimStart();
        } else line = test;
      }
      if (line) lines.push(line);
    }
  }

  // Position using Figma baseline when available:
  // baseline.position.y is distance from node top to baseline; canvas alphabetic baseline
  const useBaseline = Boolean(derived) && lines.length === 1;
  ctx.textBaseline = useBaseline ? "alphabetic" : "top";

  if (useBaseline && derived) {
    // Single-line Figma text: place by baseline
    let tx = b.x;
    const tw = ctx.measureText(lines[0]!).width;
    if (align === "CENTER") tx = b.x + (b.width - tw) / 2;
    else if (align === "RIGHT") tx = b.x + b.width - tw;
    // derived.baselineY is the baseline y in node-local space
    ctx.fillText(lines[0]!, tx, b.y + derived.baselineY);

    if (ts?.textDecoration === "UNDERLINE") {
      ctx.beginPath();
      ctx.strokeStyle = fill ?? "rgba(15,23,42,0.95)";
      ctx.lineWidth = Math.max(1, fontSize * 0.06);
      const uy = b.y + derived.baselineY + Math.max(1, fontSize * 0.12);
      ctx.moveTo(tx, uy);
      ctx.lineTo(tx + tw, uy);
      ctx.stroke();
    }
  } else {
    let ty = b.y;
    const valign = (ts?.textAlignVertical || "TOP").toUpperCase();
    const blockH = lines.length * lineH;
    if (valign === "CENTER" || valign === "MIDDLE")
      ty = b.y + Math.max(0, (Math.max(b.height, blockH) - blockH) / 2);
    else if (valign === "BOTTOM")
      ty = b.y + Math.max(0, Math.max(b.height, blockH) - blockH);

    for (const line of lines) {
      let tx = b.x;
      const tw = ctx.measureText(line).width;
      if (align === "CENTER") tx = b.x + (b.width - tw) / 2;
      else if (align === "RIGHT") tx = b.x + b.width - tw;
      ctx.fillText(line, tx, ty);
      ty += lineH;
    }
  }

  if (letterSpacingPx !== 0 && "letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      "0px";
  }
  void lineAscent;
}

/** Fast hit-test with viewport-style early rejection */
export function hitTestFast(
  doc: AlteronDocument,
  worldX: number,
  worldY: number
): NodeId | null {
  const page = doc.pages.find((p) => p.id === doc.currentPageId);
  if (!page) return null;

  const visit = (ids: NodeId[]): NodeId | null => {
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i]!;
      const node = doc.nodes[id];
      if (!node || !node.visible) continue;
      const b = node.absoluteBounds;
      if (b) {
        if (
          worldX < b.x ||
          worldX > b.x + b.width ||
          worldY < b.y ||
          worldY > b.y + b.height
        ) {
          continue; // miss entire subtree
        }
      }
      const childHit = visit(node.children);
      if (childHit) return childHit;
      if (b && b.width > 0 && b.height > 0) return id;
    }
    return null;
  };

  return visit(page.children);
}

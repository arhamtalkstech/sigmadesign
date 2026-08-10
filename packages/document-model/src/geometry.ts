/**
 * Pure geometry ops for authoring: resize handles, rotation, align, distribute, snap.
 * Does not touch imported layout unless callers apply to specific nodes.
 */
import type { AlteronDocument, Mat2D, NodeId, SceneNode, Vec2 } from "./types.js";
import { identityMat } from "./types.js";
import { computeAbsoluteTransforms, updateNode } from "./tree.js";
import { resizeParentWithConstraints } from "./constraints-apply.js";

export type ResizeHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

export type AlignMode =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "center-v"
  | "bottom"
  | "distribute-h"
  | "distribute-v";

const MIN_SIZE = 1;

export function rotationOf(m: Mat2D): number {
  return (Math.atan2(m.m10, m.m00) * 180) / Math.PI;
}

export function matFromTRS(
  x: number,
  y: number,
  rotationDeg = 0,
  sx = 1,
  sy = 1
): Mat2D {
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    m00: cos * sx,
    m01: -sin * sy,
    m02: x,
    m10: sin * sx,
    m11: cos * sy,
    m12: y,
  };
}

/** Resize node using AABB handle in world space; for axis-aligned nodes. */
export function resizeNodeByHandle(
  doc: AlteronDocument,
  id: NodeId,
  handle: ResizeHandle,
  worldX: number,
  worldY: number,
  options?: { keepAspect?: boolean; fromBounds?: { x: number; y: number; width: number; height: number } }
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node || node.locked) return doc;
  const b =
    options?.fromBounds ??
    node.absoluteBounds ?? {
      x: node.transform.m02,
      y: node.transform.m12,
      width: node.size.width,
      height: node.size.height,
    };

  let { x, y, width, height } = { ...b };
  const right = x + width;
  const bottom = y + height;

  switch (handle) {
    case "nw":
      width = right - worldX;
      height = bottom - worldY;
      x = worldX;
      y = worldY;
      break;
    case "n":
      height = bottom - worldY;
      y = worldY;
      break;
    case "ne":
      width = worldX - x;
      height = bottom - worldY;
      y = worldY;
      break;
    case "e":
      width = worldX - x;
      break;
    case "se":
      width = worldX - x;
      height = worldY - y;
      break;
    case "s":
      height = worldY - y;
      break;
    case "sw":
      width = right - worldX;
      height = worldY - y;
      x = worldX;
      break;
    case "w":
      width = right - worldX;
      x = worldX;
      break;
  }

  if (options?.keepAspect && b.width > 0 && b.height > 0) {
    const aspect = b.width / b.height;
    if (handle === "n" || handle === "s") {
      width = height * aspect;
    } else if (handle === "e" || handle === "w") {
      height = width / aspect;
    } else {
      // corners: pick dominant delta
      if (Math.abs(width / aspect - height) < Math.abs(height * aspect - width)) {
        height = width / aspect;
      } else {
        width = height * aspect;
      }
    }
  }

  width = Math.max(MIN_SIZE, width);
  height = Math.max(MIN_SIZE, height);

  // Map world top-left back to local transform translation (parent-relative approx)
  // For page-level children absolute ≈ local when parent is page.
  const parentId = node.parentId;
  let localX = x;
  let localY = y;
  if (parentId && doc.nodes[parentId]?.absoluteTransform) {
    const p = doc.nodes[parentId]!.absoluteTransform!;
    // inverse of pure translation parent for simplicity
    localX = x - p.m02;
    localY = y - p.m12;
  }

  const prevSize = { ...node.size };
  let next = updateNode(doc, id, {
    size: { width, height },
    transform: {
      ...node.transform,
      m02: localX,
      m12: localY,
    },
  });
  // Apply constraints to children when this node is a parent container
  if (node.children.length > 0) {
    next = resizeParentWithConstraints(next, id, { width, height }, prevSize);
  }
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

/** Set rotation in degrees around top-left (matches simple canvas tools). */
export function rotateNode(
  doc: AlteronDocument,
  id: NodeId,
  degrees: number
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node || node.locked) return doc;
  const x = node.transform.m02;
  const y = node.transform.m12;
  const sx = Math.hypot(node.transform.m00, node.transform.m10) || 1;
  const sy = Math.hypot(node.transform.m01, node.transform.m11) || 1;
  const next = updateNode(doc, id, {
    transform: matFromTRS(x, y, degrees, sx, sy),
    rotation: degrees,
  });
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

export function alignNodes(
  doc: AlteronDocument,
  ids: NodeId[],
  mode: AlignMode
): AlteronDocument {
  if (ids.length < 2 && !mode.startsWith("distribute")) return doc;
  const nodes = ids
    .map((id) => doc.nodes[id])
    .filter((n): n is SceneNode => Boolean(n) && n.visible !== false);
  if (nodes.length < 2) return doc;

  const bounds = nodes.map((n) => {
    const b = n.absoluteBounds ?? {
      x: n.transform.m02,
      y: n.transform.m12,
      width: n.size.width,
      height: n.size.height,
    };
    return { id: n.id, ...b };
  });

  const minX = Math.min(...bounds.map((b) => b.x));
  const maxX = Math.max(...bounds.map((b) => b.x + b.width));
  const minY = Math.min(...bounds.map((b) => b.y));
  const maxY = Math.max(...bounds.map((b) => b.y + b.height));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  let next = doc;
  const applyDxDy = (id: NodeId, dx: number, dy: number) => {
    const n = next.nodes[id];
    if (!n) return;
    next = updateNode(next, id, {
      transform: {
        ...n.transform,
        m02: n.transform.m02 + dx,
        m12: n.transform.m12 + dy,
      },
    });
  };

  if (mode === "distribute-h") {
    const sorted = [...bounds].sort((a, b) => a.x - b.x);
    const totalW = sorted.reduce((s, b) => s + b.width, 0);
    const span = maxX - minX;
    const gap = (span - totalW) / Math.max(1, sorted.length - 1);
    let cursor = minX;
    for (const b of sorted) {
      applyDxDy(b.id, cursor - b.x, 0);
      cursor += b.width + gap;
    }
  } else if (mode === "distribute-v") {
    const sorted = [...bounds].sort((a, b) => a.y - b.y);
    const totalH = sorted.reduce((s, b) => s + b.height, 0);
    const span = maxY - minY;
    const gap = (span - totalH) / Math.max(1, sorted.length - 1);
    let cursor = minY;
    for (const b of sorted) {
      applyDxDy(b.id, 0, cursor - b.y);
      cursor += b.height + gap;
    }
  } else {
    for (const b of bounds) {
      let dx = 0;
      let dy = 0;
      if (mode === "left") dx = minX - b.x;
      if (mode === "right") dx = maxX - (b.x + b.width);
      if (mode === "center-h") dx = midX - (b.x + b.width / 2);
      if (mode === "top") dy = minY - b.y;
      if (mode === "bottom") dy = maxY - (b.y + b.height);
      if (mode === "center-v") dy = midY - (b.y + b.height / 2);
      applyDxDy(b.id, dx, dy);
    }
  }

  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

export type SnapGuide = {
  orientation: "v" | "h";
  /** World position of the guide line */
  pos: number;
};

export type SnapResult = {
  x: number;
  y: number;
  guides: SnapGuide[];
};

/**
 * Snap proposed world translation (dx,dy) for selection against other nodes + page origin.
 */
export function snapTranslation(
  doc: AlteronDocument,
  selectionIds: NodeId[],
  dx: number,
  dy: number,
  thresholdWorld: number
): SnapResult {
  const sel = new Set(selectionIds);
  const moving = selectionIds
    .map((id) => doc.nodes[id]?.absoluteBounds)
    .filter(Boolean) as Array<{ x: number; y: number; width: number; height: number }>;
  if (!moving.length) return { x: dx, y: dy, guides: [] };

  const minX = Math.min(...moving.map((b) => b.x)) + dx;
  const maxX = Math.max(...moving.map((b) => b.x + b.width)) + dx;
  const midX = (minX + maxX) / 2;
  const minY = Math.min(...moving.map((b) => b.y)) + dy;
  const maxY = Math.max(...moving.map((b) => b.y + b.height)) + dy;
  const midY = (minY + maxY) / 2;

  const targetsX: number[] = [0];
  const targetsY: number[] = [0];
  for (const n of Object.values(doc.nodes)) {
    if (sel.has(n.id) || !n.absoluteBounds || n.visible === false) continue;
    const b = n.absoluteBounds;
    targetsX.push(b.x, b.x + b.width / 2, b.x + b.width);
    targetsY.push(b.y, b.y + b.height / 2, b.y + b.height);
  }

  let bestDx = dx;
  let bestDy = dy;
  let bestAbsX = thresholdWorld + 1;
  let bestAbsY = thresholdWorld + 1;
  const guides: SnapGuide[] = [];

  for (const t of targetsX) {
    for (const s of [minX, midX, maxX]) {
      const err = t - s;
      if (Math.abs(err) < bestAbsX) {
        bestAbsX = Math.abs(err);
        bestDx = dx + err;
      }
    }
  }
  for (const t of targetsY) {
    for (const s of [minY, midY, maxY]) {
      const err = t - s;
      if (Math.abs(err) < bestAbsY) {
        bestAbsY = Math.abs(err);
        bestDy = dy + err;
      }
    }
  }

  if (bestAbsX <= thresholdWorld) {
    const snappedMinX = Math.min(...moving.map((b) => b.x)) + bestDx;
    const snappedMaxX = Math.max(...moving.map((b) => b.x + b.width)) + bestDx;
    const snappedMidX = (snappedMinX + snappedMaxX) / 2;
    for (const t of targetsX) {
      if (
        Math.abs(t - snappedMinX) < 0.5 ||
        Math.abs(t - snappedMidX) < 0.5 ||
        Math.abs(t - snappedMaxX) < 0.5
      ) {
        guides.push({ orientation: "v", pos: t });
      }
    }
  } else {
    bestDx = dx;
  }
  if (bestAbsY <= thresholdWorld) {
    const snappedMinY = Math.min(...moving.map((b) => b.y)) + bestDy;
    const snappedMaxY = Math.max(...moving.map((b) => b.y + b.height)) + bestDy;
    const snappedMidY = (snappedMinY + snappedMaxY) / 2;
    for (const t of targetsY) {
      if (
        Math.abs(t - snappedMinY) < 0.5 ||
        Math.abs(t - snappedMidY) < 0.5 ||
        Math.abs(t - snappedMaxY) < 0.5
      ) {
        guides.push({ orientation: "h", pos: t });
      }
    }
  } else {
    bestDy = dy;
  }

  return { x: bestDx, y: bestDy, guides };
}

export function handlePositions(
  b: { x: number; y: number; width: number; height: number }
): Record<ResizeHandle, Vec2> {
  const { x, y, width: w, height: h } = b;
  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
  };
}

export function hitTestResizeHandle(
  b: { x: number; y: number; width: number; height: number },
  worldX: number,
  worldY: number,
  hitRadius: number
): ResizeHandle | null {
  const pts = handlePositions(b);
  let best: ResizeHandle | null = null;
  let bestD = hitRadius;
  for (const [k, p] of Object.entries(pts) as [ResizeHandle, Vec2][]) {
    const d = Math.hypot(p.x - worldX, p.y - worldY);
    if (d <= bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Rotation handle sits above top-center */
export function rotationHandlePos(
  b: { x: number; y: number; width: number; height: number },
  offset: number
): Vec2 {
  return { x: b.x + b.width / 2, y: b.y - offset };
}

export function hitTestRotationHandle(
  b: { x: number; y: number; width: number; height: number },
  worldX: number,
  worldY: number,
  offset: number,
  hitRadius: number
): boolean {
  const p = rotationHandlePos(b, offset);
  return Math.hypot(p.x - worldX, p.y - worldY) <= hitRadius;
}

export { identityMat };

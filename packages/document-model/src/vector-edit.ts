/**
 * Pen / vector path authoring helpers.
 */
import type { AlteronDocument, NodeId, Vec2, VectorPathData } from "./types.js";
import { createShapeInDocument } from "./create-node.js";
import { computeAbsoluteTransforms, updateNode } from "./tree.js";

export function pointsToPathD(points: Vec2[], closed: boolean): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x} ${first!.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  if (closed && points.length > 2) d += " Z";
  return d;
}

export function boundsOfPoints(points: Vec2[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!points.length) return { x: 0, y: 0, width: 1, height: 1 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Normalize points to local 0..size space for fillPaths */
export function localizePoints(
  points: Vec2[],
  origin: Vec2
): Vec2[] {
  return points.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
}

export function createVectorFromPoints(
  doc: AlteronDocument,
  worldPoints: Vec2[],
  options?: { closed?: boolean; strokeOnly?: boolean }
): { doc: AlteronDocument; id: NodeId } {
  if (worldPoints.length < 2) return { doc, id: "" };
  const closed = options?.closed ?? false;
  const b = boundsOfPoints(worldPoints);
  const local = localizePoints(worldPoints, { x: b.x, y: b.y });
  const d = pointsToPathD(local, closed);
  const path: VectorPathData = {
    d,
    windingRule: "nonzero",
    paint: options?.strokeOnly || !closed ? "stroke" : "fill",
  };

  const { doc: withNode, id } = createShapeInDocument(
    doc,
    "VECTOR",
    b.x,
    b.y,
    b.width,
    b.height,
    { name: "Vector" }
  );
  if (!id) return { doc, id: "" };

  let next = updateNode(withNode, id, {
    fillPaths: path.paint === "fill" ? [path] : [],
    strokePaths: path.paint === "stroke" ? [path] : closed ? [] : [path],
    vectorNormalizedSize: { width: b.width, height: b.height },
    fills: path.paint === "fill" ? withNode.nodes[id]!.fills : [],
    strokes:
      path.paint === "stroke"
        ? withNode.nodes[id]!.strokes.length
          ? withNode.nodes[id]!.strokes
          : [
              {
                type: "SOLID",
                color: { r: 0.2, g: 0.2, b: 0.25, a: 1 },
                opacity: 1,
                visible: true,
                blendMode: "NORMAL",
              },
            ]
        : [],
    strokeWeight: 2,
  });
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return { doc: next, id };
}

/** Append a point to an existing VECTOR path (last stroke or fill path). */
export function appendVectorPoint(
  doc: AlteronDocument,
  id: NodeId,
  worldPoint: Vec2,
  closed = false
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node || node.type !== "VECTOR") return doc;
  const abs = node.absoluteTransform ?? node.transform;
  const local = {
    x: worldPoint.x - abs.m02,
    y: worldPoint.y - abs.m12,
  };
  // Parse existing M/L points roughly
  const existing =
    node.strokePaths?.[0]?.d || node.fillPaths?.[0]?.d || `M 0 0`;
  const pts = parsePathPoints(existing);
  pts.push(local);
  const b = boundsOfPoints(pts);
  // Re-normalize into new box
  const shifted = localizePoints(pts, { x: b.x, y: b.y });
  const d = pointsToPathD(shifted, closed);
  const path: VectorPathData = {
    d,
    windingRule: "nonzero",
    paint: closed ? "fill" : "stroke",
  };
  let next = updateNode(doc, id, {
    transform: { ...node.transform, m02: node.transform.m02 + b.x, m12: node.transform.m12 + b.y },
    size: { width: b.width, height: b.height },
    fillPaths: closed ? [path] : [],
    strokePaths: closed ? [] : [path],
    vectorNormalizedSize: { width: b.width, height: b.height },
  });
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

export function parsePathPoints(d: string): Vec2[] {
  const pts: Vec2[] = [];
  const re = /([ML])\s*([-\d.]+)\s+([-\d.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    pts.push({ x: Number(m[2]), y: Number(m[3]) });
  }
  return pts;
}

function getPrimaryPath(node: {
  strokePaths?: VectorPathData[];
  fillPaths?: VectorPathData[];
}): VectorPathData | null {
  return node.strokePaths?.[0] ?? node.fillPaths?.[0] ?? null;
}

function applyPointsToNode(
  doc: AlteronDocument,
  id: NodeId,
  pts: Vec2[],
  closed: boolean
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  if (pts.length < 1) return doc;
  const b = boundsOfPoints(pts);
  const shifted = localizePoints(pts, { x: b.x, y: b.y });
  const d = pointsToPathD(shifted, closed && pts.length > 2);
  const paint: "fill" | "stroke" = closed && pts.length > 2 ? "fill" : "stroke";
  const path: VectorPathData = { d, windingRule: "nonzero", paint };
  // Keep world origin stable by adjusting transform with local bounds offset
  const abs = node.absoluteTransform ?? node.transform;
  const worldOriginX = abs.m02 + b.x;
  const worldOriginY = abs.m12 + b.y;
  let parentOx = 0;
  let parentOy = 0;
  if (node.parentId && doc.nodes[node.parentId]?.absoluteTransform) {
    const p = doc.nodes[node.parentId]!.absoluteTransform!;
    parentOx = p.m02;
    parentOy = p.m12;
  }
  const next = updateNode(doc, id, {
    transform: {
      ...node.transform,
      m02: worldOriginX - parentOx,
      m12: worldOriginY - parentOy,
    },
    size: { width: Math.max(1, b.width), height: Math.max(1, b.height) },
    fillPaths: paint === "fill" ? [path] : [],
    strokePaths: paint === "stroke" ? [path] : [],
    vectorNormalizedSize: {
      width: Math.max(1, b.width),
      height: Math.max(1, b.height),
    },
    fills:
      paint === "fill"
        ? node.fills.length
          ? node.fills
          : [
              {
                type: "SOLID",
                color: { r: 0.85, g: 0.85, b: 0.9, a: 1 },
                opacity: 1,
                visible: true,
                blendMode: "NORMAL",
              },
            ]
        : [],
    strokes:
      paint === "stroke"
        ? node.strokes.length
          ? node.strokes
          : [
              {
                type: "SOLID",
                color: { r: 0.2, g: 0.2, b: 0.25, a: 1 },
                opacity: 1,
                visible: true,
                blendMode: "NORMAL",
              },
            ]
        : node.strokes,
    strokeWeight: paint === "stroke" ? node.strokeWeight || 2 : node.strokeWeight,
  });
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

/** Move a path point by index (local space relative to node). */
export function moveVectorPoint(
  doc: AlteronDocument,
  id: NodeId,
  pointIndex: number,
  localPoint: Vec2,
  closed = false
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const pathSrc = getPrimaryPath(node);
  if (!pathSrc) return doc;
  const pts = parsePathPoints(pathSrc.d);
  if (pointIndex < 0 || pointIndex >= pts.length) return doc;
  pts[pointIndex] = localPoint;
  const isClosed = closed || pathSrc.d.trim().endsWith("Z");
  return applyPointsToNode(doc, id, pts, isClosed);
}

/** Insert a point after index (or at end if index = -1). */
export function insertVectorPoint(
  doc: AlteronDocument,
  id: NodeId,
  afterIndex: number,
  localPoint: Vec2,
  closed = false
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const pathSrc = getPrimaryPath(node);
  if (!pathSrc) return doc;
  const pts = parsePathPoints(pathSrc.d);
  const idx = afterIndex < 0 ? pts.length : afterIndex + 1;
  pts.splice(Math.min(idx, pts.length), 0, localPoint);
  const isClosed = closed || pathSrc.d.trim().endsWith("Z");
  return applyPointsToNode(doc, id, pts, isClosed);
}

/** Delete a path point by index. */
export function deleteVectorPoint(
  doc: AlteronDocument,
  id: NodeId,
  pointIndex: number,
  closed = false
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const pathSrc = getPrimaryPath(node);
  if (!pathSrc) return doc;
  const pts = parsePathPoints(pathSrc.d);
  if (pointIndex < 0 || pointIndex >= pts.length || pts.length <= 2) return doc;
  pts.splice(pointIndex, 1);
  const isClosed = closed || pathSrc.d.trim().endsWith("Z");
  return applyPointsToNode(doc, id, pts, isClosed && pts.length > 2);
}

/** Open or close the path. */
export function setVectorClosed(
  doc: AlteronDocument,
  id: NodeId,
  closed: boolean
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const pathSrc = getPrimaryPath(node);
  if (!pathSrc) return doc;
  const pts = parsePathPoints(pathSrc.d);
  return applyPointsToNode(doc, id, pts, closed);
}

/** Hit-test local points; returns index or -1. */
export function hitTestVectorPoint(
  doc: AlteronDocument,
  id: NodeId,
  localX: number,
  localY: number,
  radius: number
): number {
  const node = doc.nodes[id];
  if (!node) return -1;
  const pathSrc = getPrimaryPath(node);
  if (!pathSrc) return -1;
  const pts = parsePathPoints(pathSrc.d);
  let best = -1;
  let bestD = radius;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - localX, pts[i]!.y - localY);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function getVectorPoints(
  doc: AlteronDocument,
  id: NodeId
): { points: Vec2[]; closed: boolean } {
  const node = doc.nodes[id];
  if (!node) return { points: [], closed: false };
  const pathSrc = getPrimaryPath(node);
  if (!pathSrc) return { points: [], closed: false };
  return {
    points: parsePathPoints(pathSrc.d),
    closed: pathSrc.d.trim().endsWith("Z"),
  };
}

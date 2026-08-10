/**
 * Boolean operations on shapes — structural BOOLEAN_OPERATION + simple path merge.
 * Full computational geometry is out of scope; we nest operands and union path strings
 * for axis-aligned rects/ellipses when possible.
 */
import type { AlteronDocument, NodeId, SceneNode } from "./types.js";
import { createShapeInDocument } from "./create-node.js";
import { computeAbsoluteTransforms, updateNode } from "./tree.js";

export type BooleanKind = "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE";

function rectPath(w: number, h: number): string {
  return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
}

function ellipsePath(w: number, h: number): string {
  const rx = w / 2;
  const ry = h / 2;
  // Approximate ellipse with two arcs
  return `M ${rx} 0 A ${rx} ${ry} 0 1 0 ${rx} ${h} A ${rx} ${ry} 0 1 0 ${rx} 0 Z`;
}

function nodeToLocalPath(node: SceneNode): string | null {
  if (node.fillPaths?.[0]?.d) return node.fillPaths[0].d;
  if (node.type === "RECTANGLE" || node.type === "FRAME") {
    return rectPath(node.size.width, node.size.height);
  }
  if (node.type === "ELLIPSE") {
    return ellipsePath(node.size.width, node.size.height);
  }
  return null;
}

/**
 * Create a BOOLEAN_OPERATION node containing the selection as children.
 * Geometry: UNION concatenates paths; others keep children for future render.
 */
export function applyBooleanOperation(
  doc: AlteronDocument,
  ids: NodeId[],
  op: BooleanKind
): { doc: AlteronDocument; id: NodeId } {
  if (ids.length < 2) return { doc, id: "" };
  const nodes = ids
    .map((id) => doc.nodes[id])
    .filter((n): n is SceneNode => Boolean(n));
  if (nodes.length < 2) return { doc, id: "" };

  const bounds = nodes.map(
    (n) =>
      n.absoluteBounds ?? {
        x: n.transform.m02,
        y: n.transform.m12,
        width: n.size.width,
        height: n.size.height,
      }
  );
  const minX = Math.min(...bounds.map((b) => b.x));
  const minY = Math.min(...bounds.map((b) => b.y));
  const maxX = Math.max(...bounds.map((b) => b.x + b.width));
  const maxY = Math.max(...bounds.map((b) => b.y + b.height));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const { doc: withBool, id: boolId } = createShapeInDocument(
    doc,
    "BOOLEAN_OPERATION",
    minX,
    minY,
    w,
    h,
    { name: op.charAt(0) + op.slice(1).toLowerCase() }
  );
  if (!boolId) return { doc, id: "" };

  // Remove selected from their parents / page and reparent under boolean
  let next = withBool;
  const pageId = next.currentPageId!;
  const idSet = new Set(ids);

  next = {
    ...next,
    pages: next.pages.map((p) =>
      p.id === pageId
        ? { ...p, children: p.children.filter((c) => !idSet.has(c)) }
        : p
    ),
    nodes: { ...next.nodes },
  };

  for (const id of ids) {
    const n = next.nodes[id];
    if (!n) continue;
    // detach from old parent
    if (n.parentId && next.nodes[n.parentId]) {
      const parent = next.nodes[n.parentId]!;
      next.nodes[n.parentId] = {
        ...parent,
        children: parent.children.filter((c) => c !== id),
      };
    }
    const b =
      n.absoluteBounds ?? {
        x: n.transform.m02,
        y: n.transform.m12,
        width: n.size.width,
        height: n.size.height,
      };
    next.nodes[id] = {
      ...n,
      parentId: boolId,
      transform: {
        ...n.transform,
        m02: b.x - minX,
        m12: b.y - minY,
      },
    };
  }

  const boolNode = next.nodes[boolId]!;
  next.nodes[boolId] = {
    ...boolNode,
    children: [...ids],
    booleanOperation: op,
    fills: nodes[0]!.fills.length ? nodes[0]!.fills : boolNode.fills,
  };

  // Geometry: prefer axis-aligned rect boolean when all operands are simple rects
  const rectOperands = ids
    .map((id) => {
      const n = next.nodes[id]!;
      if (n.type !== "RECTANGLE" && n.type !== "FRAME") return null;
      return {
        x: n.transform.m02,
        y: n.transform.m12,
        w: n.size.width,
        h: n.size.height,
      };
    })
    .filter(Boolean) as Array<{ x: number; y: number; w: number; h: number }>;

  if (rectOperands.length === ids.length && rectOperands.length >= 2) {
    const geom = booleanAabb(rectOperands, op);
    if (geom) {
      next = updateNode(next, boolId, {
        fillPaths: [
          {
            d: rectPathLocal(geom.x, geom.y, geom.w, geom.h),
            windingRule: "nonzero",
            paint: "fill",
          },
        ],
        size: { width: w, height: h },
        vectorNormalizedSize: { width: w, height: h },
      });
    }
  } else if (op === "UNION") {
    // Fallback: merge path strings (approximation)
    const parts: string[] = [];
    for (const id of ids) {
      const n = next.nodes[id]!;
      const path = nodeToLocalPath(n);
      if (!path) continue;
      const ox = n.transform.m02;
      const oy = n.transform.m12;
      parts.push(offsetPath(path, ox, oy));
    }
    if (parts.length) {
      next = updateNode(next, boolId, {
        fillPaths: [
          {
            d: parts.join(" "),
            windingRule: op === "UNION" ? "nonzero" : "evenodd",
            paint: "fill",
          },
        ],
        vectorNormalizedSize: { width: w, height: h },
      });
    }
  } else {
    // SUBTRACT/INTERSECT/EXCLUDE with mixed shapes: evenodd compound path
    const parts: string[] = [];
    for (const id of ids) {
      const n = next.nodes[id]!;
      const path = nodeToLocalPath(n);
      if (!path) continue;
      parts.push(offsetPath(path, n.transform.m02, n.transform.m12));
    }
    if (parts.length) {
      next = updateNode(next, boolId, {
        fillPaths: [
          {
            d: parts.join(" "),
            windingRule: "evenodd",
            paint: "fill",
          },
        ],
        vectorNormalizedSize: { width: w, height: h },
      });
    }
  }

  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return { doc: next, id: boolId };
}

type Aabb = { x: number; y: number; w: number; h: number };

function rectPathLocal(x: number, y: number, w: number, h: number): string {
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}

/** Axis-aligned boolean for rectangles in boolean-local coordinates. */
export function booleanAabb(rects: Aabb[], op: BooleanKind): Aabb | null {
  if (rects.length < 2) return null;
  if (op === "UNION") {
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (op === "INTERSECT") {
    let cur = { ...rects[0]! };
    for (let i = 1; i < rects.length; i++) {
      const r = rects[i]!;
      const x1 = Math.max(cur.x, r.x);
      const y1 = Math.max(cur.y, r.y);
      const x2 = Math.min(cur.x + cur.w, r.x + r.w);
      const y2 = Math.min(cur.y + cur.h, r.y + r.h);
      if (x2 <= x1 || y2 <= y1) return { x: 0, y: 0, w: 1, h: 1 };
      cur = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    return cur;
  }
  if (op === "SUBTRACT") {
    // Result approx: first rect (render uses evenodd children for true hole)
    return { ...rects[0]! };
  }
  // EXCLUDE: union bbox
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Offset absolute M/L/A coordinates in a simple path (good enough for our generators). */
function offsetPath(d: string, ox: number, oy: number): string {
  return d.replace(
    /([ML])\s*([-\d.]+)\s+([-\d.]+)/g,
    (_m, cmd: string, x: string, y: string) =>
      `${cmd} ${Number(x) + ox} ${Number(y) + oy}`
  ).replace(
    /A\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+(\d)\s+(\d)\s+([-\d.]+)\s+([-\d.]+)/g,
    (
      _m,
      rx: string,
      ry: string,
      rot: string,
      large: string,
      sweep: string,
      x: string,
      y: string
    ) =>
      `A ${rx} ${ry} ${rot} ${large} ${sweep} ${Number(x) + ox} ${Number(y) + oy}`
  );
}

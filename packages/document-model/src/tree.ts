import type { AlteronDocument, Mat2D, NodeId, SceneNode, Vec2 } from "./types.js";
import { identityMat } from "./types.js";

export function getNode(
  doc: AlteronDocument,
  id: NodeId
): SceneNode | undefined {
  return doc.nodes[id];
}

export function getChildren(
  doc: AlteronDocument,
  id: NodeId
): SceneNode[] {
  const node = doc.nodes[id];
  if (!node) return [];
  return node.children
    .map((cid) => doc.nodes[cid])
    .filter((n): n is SceneNode => Boolean(n));
}

export function getPageRootNodes(doc: AlteronDocument): SceneNode[] {
  const page = doc.pages.find((p) => p.id === doc.currentPageId);
  if (!page) return [];
  return page.children
    .map((id) => doc.nodes[id])
    .filter((n): n is SceneNode => Boolean(n) && n.visible !== false);
}

/** Multiply A × B (column-vector convention matching Figma) */
export function multiplyMat(a: Mat2D, b: Mat2D): Mat2D {
  return {
    m00: a.m00 * b.m00 + a.m01 * b.m10,
    m01: a.m00 * b.m01 + a.m01 * b.m11,
    m02: a.m00 * b.m02 + a.m01 * b.m12 + a.m02,
    m10: a.m10 * b.m00 + a.m11 * b.m10,
    m11: a.m10 * b.m01 + a.m11 * b.m11,
    m12: a.m10 * b.m02 + a.m11 * b.m12 + a.m12,
  };
}

/** Transform a local point by a 2×3 matrix */
export function transformPoint(
  m: Mat2D,
  x: number,
  y: number
): { x: number; y: number } {
  return {
    x: m.m00 * x + m.m01 * y + m.m02,
    y: m.m10 * x + m.m11 * y + m.m12,
  };
}

/**
 * Axis-aligned bounding box of a local-space rectangle after transform.
 * Correct for scale, rotation, and reflection (negative scale / flip).
 */
export function transformedRectBounds(
  m: Mat2D,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  const c0 = transformPoint(m, 0, 0);
  const c1 = transformPoint(m, width, 0);
  const c2 = transformPoint(m, 0, height);
  const c3 = transformPoint(m, width, height);
  const minX = Math.min(c0.x, c1.x, c2.x, c3.x);
  const maxX = Math.max(c0.x, c1.x, c2.x, c3.x);
  const minY = Math.min(c0.y, c1.y, c2.y, c3.y);
  const maxY = Math.max(c0.y, c1.y, c2.y, c3.y);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function matTranslation(t: Mat2D): Vec2 {
  return { x: t.m02, y: t.m12 };
}

/** Compute absolute transforms for all nodes under a page */
export function computeAbsoluteTransforms(
  doc: AlteronDocument,
  pageId?: NodeId
): void {
  const page = doc.pages.find((p) => p.id === (pageId ?? doc.currentPageId));
  if (!page) return;

  const walk = (id: NodeId, parentAbs: Mat2D) => {
    const node = doc.nodes[id];
    if (!node) return;
    const abs = multiplyMat(parentAbs, node.transform);
    node.absoluteTransform = abs;
    // AABB of the local rect after full transform (handles flip/rotation)
    // e.g. m11=-1 flips Y so origin is not the visual top-left
    node.absoluteBounds = transformedRectBounds(
      abs,
      node.size.width,
      node.size.height
    );
    for (const childId of node.children) {
      walk(childId, abs);
    }
  };

  for (const childId of page.children) {
    walk(childId, identityMat());
  }
}

export function hitTest(
  doc: AlteronDocument,
  worldX: number,
  worldY: number,
  options?: { includeLocked?: boolean }
): NodeId | null {
  const page = doc.pages.find((p) => p.id === doc.currentPageId);
  if (!page) return null;

  // front-to-back (reverse children order)
  const visit = (ids: NodeId[]): NodeId | null => {
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i]!;
      const node = doc.nodes[id];
      if (!node || !node.visible) continue;
      if (node.locked && !options?.includeLocked) {
        // still test children
        const childHit = visit(node.children);
        if (childHit) return childHit;
        continue;
      }

      const childHit = visit(node.children);
      if (childHit) return childHit;

      const b = node.absoluteBounds;
      if (!b) continue;
      if (
        worldX >= b.x &&
        worldX <= b.x + b.width &&
        worldY >= b.y &&
        worldY <= b.y + b.height
      ) {
        // skip zero-size / page-sized empty frames as last resort — still return
        if (b.width > 0 && b.height > 0) return id;
      }
    }
    return null;
  };

  return visit(page.children);
}

export function updateNode(
  doc: AlteronDocument,
  id: NodeId,
  patch: Partial<SceneNode>
): AlteronDocument {
  const existing = doc.nodes[id];
  if (!existing) return doc;
  // Allow explicit type changes (e.g. promote FRAME/RECTANGLE → COMPONENT)
  // while defaulting to the existing type when patch omits it.
  const nextType = patch.type ?? existing.type;
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [id]: { ...existing, ...patch, id: existing.id, type: nextType } as SceneNode,
    },
  };
}

export function walkNodes(
  doc: AlteronDocument,
  rootIds: NodeId[],
  fn: (node: SceneNode, depth: number) => void,
  depth = 0
): void {
  for (const id of rootIds) {
    const node = doc.nodes[id];
    if (!node) continue;
    fn(node, depth);
    if (node.children.length) {
      walkNodes(doc, node.children, fn, depth + 1);
    }
  }
}

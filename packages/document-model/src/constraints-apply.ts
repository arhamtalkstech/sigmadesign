/**
 * Apply layout constraints when a parent frame's size changes.
 * Children with constraints.horizontal/vertical adjust position/size relative
 * to previous parent size.
 */
import type { AlteronDocument, LayoutConstraints, NodeId, SceneNode } from "./types.js";
import { computeAbsoluteTransforms, updateNode } from "./tree.js";

export type Size = { width: number; height: number };

/**
 * Resize parent and reflow constrained children using previous parent size.
 */
export function resizeParentWithConstraints(
  doc: AlteronDocument,
  parentId: NodeId,
  newSize: Size,
  previousSize?: Size
): AlteronDocument {
  const parent = doc.nodes[parentId];
  if (!parent) return doc;
  const prev = previousSize ?? { ...parent.size };
  const nextW = Math.max(1, newSize.width);
  const nextH = Math.max(1, newSize.height);
  if (prev.width === nextW && prev.height === nextH) return doc;

  let next = updateNode(doc, parentId, {
    size: { width: nextW, height: nextH },
  });

  for (const childId of parent.children) {
    const child = next.nodes[childId];
    if (!child || child.locked) continue;
    // Skip auto-layout managed children — layout-edit owns those
    if (parent.layout?.managed && parent.layout.mode !== "NONE") continue;
    next = applyConstraintsToChild(next, parentId, childId, prev, {
      width: nextW,
      height: nextH,
    });
  }

  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

export function applyConstraintsToChild(
  doc: AlteronDocument,
  parentId: NodeId,
  childId: NodeId,
  prevParent: Size,
  nextParent: Size
): AlteronDocument {
  const child = doc.nodes[childId];
  if (!child) return doc;
  const c: LayoutConstraints = child.constraints ?? {
    horizontal: "MIN",
    vertical: "MIN",
  };

  let x = child.transform.m02;
  let y = child.transform.m12;
  let w = child.size.width;
  let h = child.size.height;

  const dW = nextParent.width - prevParent.width;
  const dH = nextParent.height - prevParent.height;

  switch (c.horizontal) {
    case "MIN":
      // pin left — no change to x/w
      break;
    case "MAX":
      x += dW;
      break;
    case "CENTER":
      x += dW / 2;
      break;
    case "STRETCH":
      w = Math.max(1, w + dW);
      break;
    case "SCALE": {
      if (prevParent.width > 0) {
        const sx = nextParent.width / prevParent.width;
        x *= sx;
        w = Math.max(1, w * sx);
      }
      break;
    }
    default:
      break;
  }

  switch (c.vertical) {
    case "MIN":
      break;
    case "MAX":
      y += dH;
      break;
    case "CENTER":
      y += dH / 2;
      break;
    case "STRETCH":
      h = Math.max(1, h + dH);
      break;
    case "SCALE": {
      if (prevParent.height > 0) {
        const sy = nextParent.height / prevParent.height;
        y *= sy;
        h = Math.max(1, h * sy);
      }
      break;
    }
    default:
      break;
  }

  return updateNode(doc, childId, {
    transform: { ...child.transform, m02: x, m12: y },
    size: { width: w, height: h },
  });
}

/** Convenience: if node is resized and has children, apply constraints. */
export function resizeNodeApplyingConstraints(
  doc: AlteronDocument,
  id: NodeId,
  newSize: Size
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  if (node.children.length > 0) {
    return resizeParentWithConstraints(doc, id, newSize, { ...node.size });
  }
  let next = updateNode(doc, id, { size: newSize });
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

export function defaultConstraints(): LayoutConstraints {
  return { horizontal: "MIN", vertical: "MIN" };
}

export type { SceneNode };

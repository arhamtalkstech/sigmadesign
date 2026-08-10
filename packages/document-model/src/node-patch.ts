/**
 * Apply property patches to a node. Size changes go through constraint
 * reflow so Design-panel W/H matches canvas resize handles.
 */
import type { AlteronDocument, NodeId, SceneNode } from "./types.js";
import { computeAbsoluteTransforms, updateNode } from "./tree.js";
import { resizeNodeApplyingConstraints } from "./constraints-apply.js";

/**
 * Patch a single node. When `size` is present, uses
 * `resizeNodeApplyingConstraints` (with previous size) so children with
 * MAX/CENTER/STRETCH/SCALE constraints reflow.
 */
export function applyNodePatch(
  doc: AlteronDocument,
  id: NodeId,
  patch: Partial<SceneNode>
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;

  if (patch.size) {
    const newSize = {
      width: Math.max(1, patch.size.width ?? node.size.width),
      height: Math.max(1, patch.size.height ?? node.size.height),
    };
    // Strip size from remainder so we don't double-apply without constraints
    const { size: _size, ...rest } = patch;
    let next = resizeNodeApplyingConstraints(doc, id, newSize);
    if (Object.keys(rest).length > 0) {
      next = updateNode(next, id, rest);
      if (next.currentPageId) {
        computeAbsoluteTransforms(next, next.currentPageId);
      }
    }
    return next;
  }

  let next = updateNode(doc, id, patch);
  if (next.currentPageId) {
    computeAbsoluteTransforms(next, next.currentPageId);
  }
  return next;
}

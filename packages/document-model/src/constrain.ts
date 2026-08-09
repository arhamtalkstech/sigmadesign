import type { AlteronDocument, NodeId } from "./types.js";
import { applyAutoLayout } from "./auto-layout.js";
import { computeAbsoluteTransforms } from "./tree.js";

/**
 * Light clamp for synthetic expanded content only.
 * Never rewrite sizes of original Figma nodes — those are source of truth.
 */
export function constrainChildSizes(
  doc: AlteronDocument,
  pageId?: NodeId
): void {
  const page = doc.pages.find((p) => p.id === (pageId ?? doc.currentPageId));
  if (!page) return;

  const walk = (id: NodeId) => {
    const node = doc.nodes[id];
    if (!node) return;

    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (!child) continue;

      // Only clamp synthetic nodes that overflow their parent
      if (childId.startsWith("99:")) {
        const padR = node.layout?.padding.right ?? 0;
        const originX = child.transform.m02;
        const maxW = node.size.width - padR - originX;
        if (maxW > 8 && child.size.width > maxW + 1) {
          child.size = { ...child.size, width: maxW };
        }
      }

      walk(childId);
    }
  };

  for (const id of page.children) walk(id);
  computeAbsoluteTransforms(doc, page.id);
}

/**
 * Finalize layout after import:
 * 1. Absolute transforms from Figma-baked local transforms (authoritative)
 * 2. Light reflow only inside expanded instances
 * 3. Light clamp on synthetic overflow only
 */
export function finalizeLayout(doc: AlteronDocument, pageId?: NodeId): void {
  const pid = pageId ?? doc.currentPageId;
  if (!pid) return;
  computeAbsoluteTransforms(doc, pid);
  applyAutoLayout(doc, pid);
  constrainChildSizes(doc, pid);
  computeAbsoluteTransforms(doc, pid);
}

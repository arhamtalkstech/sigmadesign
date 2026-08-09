import type { AlteronDocument, NodeId, SceneNode } from "./types.js";
import { computeAbsoluteTransforms } from "./tree.js";

/**
 * Figma .fig files already store *final* layout positions and sizes on every
 * node. Blindly reflowing auto-layout destroys that data (tabs shrink, text
 * widths change, buttons reflow wrong).
 *
 * We only reflow **synthetic** subtrees created by instance expansion
 * (ids like `99:…`) whose parent is also synthetic or is an INSTANCE whose
 * size no longer matches the master's baked child layout.
 *
 * Original Figma nodes (session:local ids from the file) are left untouched.
 */
function isSyntheticId(id: string): boolean {
  return id.startsWith("99:");
}

export function applyAutoLayout(doc: AlteronDocument, pageId?: NodeId): void {
  const page = doc.pages.find((p) => p.id === (pageId ?? doc.currentPageId));
  if (!page) return;

  // Only reflow containers that have synthetic children (expanded instances)
  const reflowTargets: NodeId[] = [];

  const collect = (id: NodeId) => {
    const node = doc.nodes[id];
    if (!node) return;
    for (const cid of node.children) collect(cid);

    if (!node.layout) return;
    if (node.layout.mode !== "HORIZONTAL" && node.layout.mode !== "VERTICAL")
      return;

    const hasSyntheticChild = node.children.some((cid) => isSyntheticId(cid));
    // Instance or synthetic frame with expanded kids may need centering
    if (
      hasSyntheticChild &&
      (node.type === "INSTANCE" || isSyntheticId(id))
    ) {
      reflowTargets.push(id);
    }
  };

  for (const id of page.children) collect(id);

  // Deepest first
  reflowTargets.sort((a, b) => {
    const da = depthOf(doc, a);
    const db = depthOf(doc, b);
    return db - da;
  });

  for (const id of reflowTargets) {
    reflowOne(doc, id);
  }

  computeAbsoluteTransforms(doc, page.id);
}

function depthOf(doc: AlteronDocument, id: NodeId): number {
  let d = 0;
  let cur: string | null | undefined = id;
  while (cur && doc.nodes[cur]) {
    d++;
    cur = doc.nodes[cur]!.parentId;
    if (d > 64) break;
  }
  return d;
}

function reflowOne(doc: AlteronDocument, id: NodeId): void {
  const node = doc.nodes[id];
  if (!node?.layout) return;
  const layout = node.layout;
  if (layout.mode !== "HORIZONTAL" && layout.mode !== "VERTICAL") return;

  // Only reposition synthetic children; leave original Figma nodes alone
  const kids = node.children
    .map((cid) => doc.nodes[cid])
    .filter((c): c is SceneNode => Boolean(c) && c.visible !== false);
  if (!kids.length) return;

  const allSynthetic = kids.every((k) => isSyntheticId(k.id));
  if (!allSynthetic) {
    // Mixed tree: only reflow if this is an INSTANCE with all-expanded kids
    if (node.type !== "INSTANCE") return;
  }

  const pad = layout.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const gap = layout.gap ?? 0;
  const isRow = layout.mode === "HORIZONTAL";
  const innerW = Math.max(0, node.size.width - pad.left - pad.right);
  const innerH = Math.max(0, node.size.height - pad.top - pad.bottom);

  // Prefer Figma-baked positions when content already fits — only fix centering
  // when primaryAlign is CENTER and children are clearly wrong.
  const align = layout.primaryAlign ?? "MIN";
  const needCenter =
    align === "CENTER" ||
    align === "CENTER_CENTER" ||
    align === "MAX" ||
    align === "MAX_MAX";

  if (!needCenter && node.type !== "INSTANCE") return;

  const growTotal = kids.reduce((s, k) => s + (k.layoutGrow ?? 0), 0);

  // Do NOT redistribute FILL grow on original Figma containers — sizes are baked.
  // Only center/pack synthetic children inside a fixed instance box.
  let fixedPrimary = 0;
  for (const k of kids) {
    fixedPrimary += isRow ? k.size.width : k.size.height;
  }
  const gaps = gap * Math.max(0, kids.length - 1);
  const contentLen = fixedPrimary + gaps;
  const maxLen = isRow ? innerW : innerH;

  let cursor = isRow ? pad.left : pad.top;
  if (align === "CENTER" || align === "CENTER_CENTER") {
    cursor += Math.max(0, (maxLen - contentLen) / 2);
  } else if (align === "MAX" || align === "MAX_MAX") {
    cursor += Math.max(0, maxLen - contentLen);
  }

  for (const child of kids) {
    // Never change sizes of original nodes; only synthetic
    const w = child.size.width;
    const h = child.size.height;

    const counter = layout.counterAlign ?? child.layoutAlign ?? "MIN";
    let cross = isRow ? pad.top : pad.left;
    if (counter === "CENTER" || counter === "CENTER_CENTER") {
      const crossSize = isRow ? h : w;
      const crossMax = isRow ? innerH : innerW;
      cross += Math.max(0, (crossMax - crossSize) / 2);
    } else if (counter === "STRETCH" || counter === "STRETCH_STRETCH") {
      // keep baked size; stretch was already applied by Figma in the master
    }

    if (isRow) {
      child.transform = { ...child.transform, m02: cursor, m12: cross };
      cursor += w + gap;
    } else {
      child.transform = { ...child.transform, m02: cross, m12: cursor };
      cursor += h + gap;
    }
  }

  void growTotal;
}

/**
 * Editable auto-layout for user-managed containers.
 * Never reflows imported Figma nodes unless layout.managed === true.
 */
import type { AlteronDocument, AutoLayout, NodeId, SceneNode } from "./types.js";
import { computeAbsoluteTransforms, updateNode } from "./tree.js";

export function isManagedLayout(node: SceneNode): boolean {
  return Boolean(node.layout?.managed);
}

export function setAutoLayout(
  doc: AlteronDocument,
  id: NodeId,
  patch: Partial<AutoLayout> & { mode?: AutoLayout["mode"] }
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const prev = node.layout ?? {
    mode: "NONE",
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const layout: AutoLayout = {
    ...prev,
    ...patch,
    padding: { ...prev.padding, ...(patch.padding ?? {}) },
    managed: true,
  };
  let next = updateNode(doc, id, { layout });
  next = reflowManagedLayouts(next, id);
  return next;
}

export function reflowManagedLayouts(
  doc: AlteronDocument,
  rootId?: NodeId
): AlteronDocument {
  const page = doc.pages.find((p) => p.id === doc.currentPageId);
  if (!page) return doc;

  // Work on a mutable clone of nodes for in-place reflow then return new doc ref
  const nodes = { ...doc.nodes };
  const nextDoc = { ...doc, nodes };

  const targets: NodeId[] = [];
  const collect = (id: NodeId) => {
    const n = nodes[id];
    if (!n) return;
    for (const c of n.children) collect(c);
    if (
      n.layout?.managed &&
      (n.layout.mode === "HORIZONTAL" || n.layout.mode === "VERTICAL")
    ) {
      targets.push(id);
    }
  };

  if (rootId) collect(rootId);
  else for (const id of page.children) collect(id);

  // deepest first
  targets.sort((a, b) => depth(nodes, b) - depth(nodes, a));

  for (const id of targets) reflowOne(nodes, id);

  computeAbsoluteTransforms(nextDoc, page.id);
  return nextDoc;
}

function depth(nodes: Record<string, SceneNode>, id: NodeId): number {
  let d = 0;
  let cur: string | null | undefined = id;
  while (cur && nodes[cur]) {
    d++;
    cur = nodes[cur]!.parentId;
    if (d > 64) break;
  }
  return d;
}

function reflowOne(nodes: Record<string, SceneNode>, id: NodeId): void {
  const node = nodes[id];
  if (!node?.layout) return;
  const layout = node.layout;
  if (layout.mode !== "HORIZONTAL" && layout.mode !== "VERTICAL") return;

  const kids = node.children
    .map((cid) => nodes[cid])
    .filter((c): c is SceneNode => Boolean(c) && c.visible !== false);
  if (!kids.length) return;

  const pad = layout.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const gap = layout.gap ?? 0;
  const isRow = layout.mode === "HORIZONTAL";

  // HUG primary: size container to content
  const primarySizing = layout.primarySizing ?? "FIXED";
  const counterSizing = layout.counterSizing ?? "FIXED";

  // FILL grow distribution
  let fixedPrimary = 0;
  let growSum = 0;
  for (const k of kids) {
    const sizing = isRow
      ? k.layoutSizingHorizontal ?? (k.layoutGrow ? "FILL" : "FIXED")
      : k.layoutSizingVertical ?? (k.layoutGrow ? "FILL" : "FIXED");
    if (sizing === "FILL" || (k.layoutGrow ?? 0) > 0) {
      growSum += k.layoutGrow && k.layoutGrow > 0 ? k.layoutGrow : 1;
    } else {
      fixedPrimary += isRow ? k.size.width : k.size.height;
    }
  }
  const gaps = gap * Math.max(0, kids.length - 1);

  let innerPrimary =
    (isRow ? node.size.width : node.size.height) - (isRow ? pad.left + pad.right : pad.top + pad.bottom);

  if (primarySizing === "HUG") {
    innerPrimary = fixedPrimary + gaps;
    // FILL kids with hug parent: use min 0 free space
  }

  const free = Math.max(0, innerPrimary - fixedPrimary - gaps);

  // Counter hug
  let maxCross = 0;
  for (const k of kids) {
    maxCross = Math.max(maxCross, isRow ? k.size.height : k.size.width);
  }

  let cursor = isRow ? pad.left : pad.top;
  const align = layout.primaryAlign ?? "MIN";
  if (align === "CENTER" || align === "CENTER_CENTER") {
    const content = fixedPrimary + gaps + (growSum > 0 ? free : 0);
    cursor += Math.max(0, (innerPrimary - content) / 2);
  } else if (align === "MAX" || align === "MAX_MAX" || align === "SPACE_BETWEEN") {
    if (align !== "SPACE_BETWEEN") {
      const content = fixedPrimary + gaps + (growSum > 0 ? free : 0);
      cursor += Math.max(0, innerPrimary - content);
    }
  }

  const spaceBetweenGap =
    align === "SPACE_BETWEEN" && kids.length > 1
      ? Math.max(0, (innerPrimary - fixedPrimary - (growSum > 0 ? free : 0)) / (kids.length - 1))
      : gap;

  for (const child of kids) {
    const sizing = isRow
      ? child.layoutSizingHorizontal ?? (child.layoutGrow ? "FILL" : "FIXED")
      : child.layoutSizingVertical ?? (child.layoutGrow ? "FILL" : "FIXED");

    let w = child.size.width;
    let h = child.size.height;
    if (sizing === "FILL" || (child.layoutGrow ?? 0) > 0) {
      const g = child.layoutGrow && child.layoutGrow > 0 ? child.layoutGrow : 1;
      const share = growSum > 0 ? (free * g) / growSum : 0;
      if (isRow) w = Math.max(1, share);
      else h = Math.max(1, share);
    }

    // Counter stretch
    const counter = layout.counterAlign ?? child.layoutAlign ?? "MIN";
    if (counter === "STRETCH" || counter === "STRETCH_STRETCH") {
      if (isRow) h = Math.max(1, node.size.height - pad.top - pad.bottom);
      else w = Math.max(1, node.size.width - pad.left - pad.right);
    }

    let cross = isRow ? pad.top : pad.left;
    if (counter === "CENTER" || counter === "CENTER_CENTER") {
      const crossSize = isRow ? h : w;
      const crossMax = isRow
        ? node.size.height - pad.top - pad.bottom
        : node.size.width - pad.left - pad.right;
      cross += Math.max(0, (crossMax - crossSize) / 2);
    } else if (counter === "MAX" || counter === "MAX_MAX") {
      const crossSize = isRow ? h : w;
      const crossMax = isRow
        ? node.size.height - pad.top - pad.bottom
        : node.size.width - pad.left - pad.right;
      cross += Math.max(0, crossMax - crossSize);
    }

    nodes[child.id] = {
      ...child,
      size: { width: w, height: h },
      transform: isRow
        ? { ...child.transform, m02: cursor, m12: cross }
        : { ...child.transform, m02: cross, m12: cursor },
    };

    cursor += (isRow ? w : h) + spaceBetweenGap;
  }

  // Apply HUG sizing on container
  if (primarySizing === "HUG" || counterSizing === "HUG") {
    let newW = node.size.width;
    let newH = node.size.height;
    if (isRow) {
      if (primarySizing === "HUG") newW = pad.left + pad.right + fixedPrimary + gaps + (growSum > 0 ? free : 0);
      // recompute content length from kids
      const contentW =
        kids.reduce((s, k) => s + (nodes[k.id]?.size.width ?? k.size.width), 0) +
        spaceBetweenGap * Math.max(0, kids.length - 1);
      if (primarySizing === "HUG") newW = pad.left + pad.right + contentW;
      if (counterSizing === "HUG") {
        const contentH = Math.max(
          ...kids.map((k) => nodes[k.id]?.size.height ?? k.size.height),
          0
        );
        newH = pad.top + pad.bottom + contentH;
      }
    } else {
      const contentH =
        kids.reduce((s, k) => s + (nodes[k.id]?.size.height ?? k.size.height), 0) +
        spaceBetweenGap * Math.max(0, kids.length - 1);
      if (primarySizing === "HUG") newH = pad.top + pad.bottom + contentH;
      if (counterSizing === "HUG") {
        const contentW = Math.max(
          ...kids.map((k) => nodes[k.id]?.size.width ?? k.size.width),
          0
        );
        newW = pad.left + pad.right + contentW;
      }
    }
    nodes[id] = {
      ...nodes[id]!,
      size: { width: Math.max(1, newW), height: Math.max(1, newH) },
    };
  }

  void maxCross;
}

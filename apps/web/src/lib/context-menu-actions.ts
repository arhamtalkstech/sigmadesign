/**
 * Pure document mutations for canvas context-menu actions.
 * Tested without React; store wraps these for undo/history.
 */
import {
  computeAbsoluteTransforms,
  updateNode,
  type AlteronDocument,
  type NodeId,
  type SceneNode,
} from "@alteron/document-model";

export type ContextMenuActionId =
  | "edit-properties"
  | "toggle-visibility"
  | "duplicate"
  | "bring-to-front"
  | "send-to-back"
  | "delete";

export interface ContextMenuItem {
  id: ContextMenuActionId;
  label: string;
  danger?: boolean;
  separatorAfter?: boolean;
}

/** Menu items shown for a node (style + structure). */
export const CONTEXT_MENU_ITEMS: ContextMenuItem[] = [
  { id: "edit-properties", label: "Edit properties" },
  { id: "toggle-visibility", label: "Toggle visibility", separatorAfter: true },
  { id: "duplicate", label: "Duplicate" },
  { id: "bring-to-front", label: "Bring to front" },
  { id: "send-to-back", label: "Send to back", separatorAfter: true },
  { id: "delete", label: "Delete", danger: true },
];

function siblingList(
  doc: AlteronDocument,
  node: SceneNode
): { parentKey: "page" | "node"; parentId: NodeId; list: NodeId[] } | null {
  const parentId = node.parentId;
  if (!parentId) return null;
  const parent = doc.nodes[parentId];
  if (parent) {
    return { parentKey: "node", parentId, list: [...parent.children] };
  }
  const page = doc.pages.find((p) => p.id === parentId);
  if (page) {
    return { parentKey: "page", parentId, list: [...page.children] };
  }
  return null;
}

function setSiblingList(
  doc: AlteronDocument,
  meta: { parentKey: "page" | "node"; parentId: NodeId },
  list: NodeId[]
): AlteronDocument {
  if (meta.parentKey === "node") {
    const parent = doc.nodes[meta.parentId];
    if (!parent) return doc;
    return {
      ...doc,
      nodes: {
        ...doc.nodes,
        [meta.parentId]: { ...parent, children: list },
      },
    };
  }
  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.id === meta.parentId ? { ...p, children: list } : p
    ),
  };
}

export function toggleNodeVisibility(
  doc: AlteronDocument,
  id: NodeId
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  return updateNode(doc, id, { visible: node.visible === false });
}

export function deleteNodes(
  doc: AlteronDocument,
  ids: NodeId[]
): AlteronDocument {
  if (!ids.length) return doc;
  const remove = new Set(ids);
  // Also remove descendants
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    const n = doc.nodes[id];
    if (!n) continue;
    for (const c of n.children) {
      remove.add(c);
      stack.push(c);
    }
  }

  let nodes = { ...doc.nodes };
  for (const id of remove) delete nodes[id];

  // Strip from all parent child lists and pages
  for (const id of Object.keys(nodes)) {
    const n = nodes[id]!;
    if (n.children.some((c) => remove.has(c))) {
      nodes[id] = {
        ...n,
        children: n.children.filter((c) => !remove.has(c)),
      };
    }
  }

  const pages = doc.pages.map((p) => ({
    ...p,
    children: p.children.filter((c) => !remove.has(c)),
  }));

  const next: AlteronDocument = { ...doc, nodes, pages };
  if (next.currentPageId) {
    computeAbsoluteTransforms(next, next.currentPageId);
  }
  return next;
}

export function reorderSibling(
  doc: AlteronDocument,
  id: NodeId,
  place: "front" | "back"
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const meta = siblingList(doc, node);
  if (!meta) return doc;
  const list = meta.list.filter((x) => x !== id);
  if (place === "front") list.push(id);
  else list.unshift(id);
  const next = setSiblingList(doc, meta, list);
  if (next.currentPageId) {
    computeAbsoluteTransforms(next, next.currentPageId);
  }
  return next;
}

export function duplicateNode(
  doc: AlteronDocument,
  id: NodeId,
  newIdFactory: () => string
): { doc: AlteronDocument; newId: string | null } {
  const node = doc.nodes[id];
  if (!node) return { doc, newId: null };
  const meta = siblingList(doc, node);
  if (!meta) return { doc, newId: null };

  const newId = newIdFactory();
  // Shallow clone of leaf/structure without deep-copying entire subtree for perf
  // — duplicate single node + empty children for containers
  const clone: SceneNode = {
    ...structuredClone(node),
    id: newId,
    name: `${node.name} copy`,
    children: [],
    transform: {
      ...node.transform,
      m02: node.transform.m02 + 16,
      m12: node.transform.m12 + 16,
    },
  };

  const nodes = { ...doc.nodes, [newId]: clone };
  const list = [...meta.list];
  const idx = list.indexOf(id);
  list.splice(idx < 0 ? list.length : idx + 1, 0, newId);

  let next: AlteronDocument = { ...doc, nodes };
  next = setSiblingList(next, meta, list);
  // re-get clone with correct parent
  next = {
    ...next,
    nodes: {
      ...next.nodes,
      [newId]: { ...next.nodes[newId]!, parentId: meta.parentId },
    },
  };
  if (next.currentPageId) {
    computeAbsoluteTransforms(next, next.currentPageId);
  }
  return { doc: next, newId };
}

export type MenuDispatchResult = {
  doc: AlteronDocument;
  selection: NodeId[];
  focusProperties: boolean;
  status: string;
};

/**
 * Apply a context-menu action. Pure — no store side effects.
 */
export function applyContextMenuAction(
  doc: AlteronDocument,
  selection: NodeId[],
  targetId: NodeId,
  action: ContextMenuActionId,
  newIdFactory: () => string = () => `local:${Date.now()}`
): MenuDispatchResult {
  const ids = selection.includes(targetId) ? selection : [targetId];

  switch (action) {
    case "edit-properties":
      return {
        doc,
        selection: [targetId],
        focusProperties: true,
        status: "Properties",
      };
    case "toggle-visibility": {
      let next = doc;
      for (const id of ids) next = toggleNodeVisibility(next, id);
      if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
      return {
        doc: next,
        selection: ids,
        focusProperties: false,
        status: "Toggled visibility",
      };
    }
    case "duplicate": {
      let next = doc;
      const newIds: NodeId[] = [];
      for (const id of ids) {
        const r = duplicateNode(next, id, newIdFactory);
        next = r.doc;
        if (r.newId) newIds.push(r.newId);
      }
      return {
        doc: next,
        selection: newIds.length ? newIds : ids,
        focusProperties: false,
        status: `Duplicated ${newIds.length || ids.length} layer(s)`,
      };
    }
    case "bring-to-front": {
      let next = doc;
      for (const id of ids) next = reorderSibling(next, id, "front");
      return {
        doc: next,
        selection: ids,
        focusProperties: false,
        status: "Brought to front",
      };
    }
    case "send-to-back": {
      let next = doc;
      for (const id of ids) next = reorderSibling(next, id, "back");
      return {
        doc: next,
        selection: ids,
        focusProperties: false,
        status: "Sent to back",
      };
    }
    case "delete": {
      const next = deleteNodes(doc, ids);
      return {
        doc: next,
        selection: [],
        focusProperties: false,
        status: `Deleted ${ids.length} layer(s)`,
      };
    }
    default:
      return {
        doc,
        selection,
        focusProperties: false,
        status: "",
      };
  }
}

/**
 * Create components from selection, instantiate, and swap instances.
 */
import type { AlteronDocument, NodeId, SceneNode } from "./types.js";
import { nextLocalId } from "./create-node.js";
import { computeAbsoluteTransforms, updateNode } from "./tree.js";

function deepCloneSubtree(
  doc: AlteronDocument,
  rootId: NodeId,
  idMap: Map<NodeId, NodeId>
): Record<NodeId, SceneNode> {
  const out: Record<NodeId, SceneNode> = {};
  const walk = (id: NodeId) => {
    const n = doc.nodes[id];
    if (!n) return;
    const newId = idMap.get(id) ?? nextLocalId("cmp");
    idMap.set(id, newId);
    for (const c of n.children) walk(c);
    const children = n.children.map((c) => idMap.get(c)!).filter(Boolean);
    out[newId] = {
      ...structuredClone(n),
      id: newId,
      children,
      parentId: null, // fixed by caller
    } as SceneNode;
  };
  walk(rootId);
  // fix parentIds
  for (const [oldId, newId] of idMap) {
    const old = doc.nodes[oldId];
    const neu = out[newId];
    if (!old || !neu) continue;
    if (old.parentId && idMap.has(old.parentId)) {
      neu.parentId = idMap.get(old.parentId)!;
    }
  }
  return out;
}

/**
 * Promote the first selected node into a COMPONENT (in place).
 * Nested selection: uses the top-level selected node.
 */
export function createComponentFromNode(
  doc: AlteronDocument,
  nodeId: NodeId
): { doc: AlteronDocument; componentId: NodeId } {
  const node = doc.nodes[nodeId];
  if (!node) return { doc, componentId: "" };

  const componentId = nodeId;
  const key = `key_${componentId}`;
  let next = updateNode(doc, nodeId, {
    type: "COMPONENT",
    name: node.name.startsWith("Component") ? node.name : node.name,
    componentKey: key,
  } as Partial<SceneNode>);

  next = {
    ...next,
    components: {
      ...next.components,
      [componentId]: { id: componentId, name: next.nodes[componentId]!.name, key },
    },
  };
  return { doc: next, componentId };
}

/** Create an INSTANCE of a component near the master. */
export function createInstanceOf(
  doc: AlteronDocument,
  componentId: NodeId,
  offset = { x: 40, y: 40 }
): { doc: AlteronDocument; instanceId: NodeId } {
  const master = doc.nodes[componentId];
  if (!master || (master.type !== "COMPONENT" && !doc.components[componentId])) {
    return { doc, instanceId: "" };
  }

  const idMap = new Map<NodeId, NodeId>();
  const cloned = deepCloneSubtree(doc, componentId, idMap);
  const instanceId = idMap.get(componentId)!;
  const pageId = doc.currentPageId;
  if (!pageId) return { doc, instanceId: "" };

  // Mark root as INSTANCE
  const root = cloned[instanceId]!;
  cloned[instanceId] = {
    ...root,
    type: "INSTANCE",
    name: `${master.name} Instance`,
    componentId,
    componentKey:
      doc.components[componentId]?.key ??
      (master as { componentKey?: string }).componentKey,
    parentId: pageId,
    transform: {
      ...root.transform,
      m02: master.transform.m02 + offset.x,
      m12: master.transform.m12 + offset.y,
    },
  } as SceneNode;

  // Remap nested parents already done; attach root to page
  const nodes = { ...doc.nodes, ...cloned };
  const pages = doc.pages.map((p) =>
    p.id === pageId ? { ...p, children: [...p.children, instanceId] } : p
  );
  const next: AlteronDocument = { ...doc, nodes, pages };
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return { doc: next, instanceId };
}

/** Swap instance to point at another component (rebuilds children from master). */
export function swapInstanceComponent(
  doc: AlteronDocument,
  instanceId: NodeId,
  newComponentId: NodeId
): AlteronDocument {
  const inst = doc.nodes[instanceId];
  const master = doc.nodes[newComponentId];
  if (!inst || inst.type !== "INSTANCE" || !master) return doc;

  // Remove old expanded children
  let next: AlteronDocument = { ...doc, nodes: { ...doc.nodes } };
  const removeRecursive = (id: NodeId) => {
    const n = next.nodes[id];
    if (!n) return;
    for (const c of n.children) removeRecursive(c);
    if (id !== instanceId) delete next.nodes[id];
  };
  for (const c of inst.children) removeRecursive(c);

  const idMap = new Map<NodeId, NodeId>();
  // Don't remap master root to instance — clone children only
  const childClones: Record<NodeId, SceneNode> = {};
  for (const childId of master.children) {
    const sub = deepCloneSubtree(doc, childId, idMap);
    Object.assign(childClones, sub);
  }
  const newChildIds = master.children.map((c) => idMap.get(c)!).filter(Boolean);
  for (const cid of newChildIds) {
    if (childClones[cid]) {
      childClones[cid] = { ...childClones[cid]!, parentId: instanceId };
    }
  }

  next.nodes = { ...next.nodes, ...childClones };
  next.nodes[instanceId] = {
    ...inst,
    children: newChildIds,
    componentId: newComponentId,
    componentKey:
      doc.components[newComponentId]?.key ??
      (master as { componentKey?: string }).componentKey,
    size: { ...master.size },
  } as SceneNode;

  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

/** Override a text property on an instance child by name match. */
export function overrideInstanceText(
  doc: AlteronDocument,
  instanceId: NodeId,
  childName: string,
  characters: string
): AlteronDocument {
  const inst = doc.nodes[instanceId];
  if (!inst) return doc;
  const stack = [...inst.children];
  while (stack.length) {
    const id = stack.pop()!;
    const n = doc.nodes[id];
    if (!n) continue;
    if (n.name === childName && n.type === "TEXT" && "characters" in n) {
      return updateNode(doc, id, { characters } as Partial<SceneNode>);
    }
    stack.push(...n.children);
  }
  return doc;
}

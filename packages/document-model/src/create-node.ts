import type {
  AlteronDocument,
  NodeId,
  NodeType,
  SceneNode,
  TextNode,
} from "./types.js";
import { identityMat, solidPaint } from "./types.js";
import { computeAbsoluteTransforms } from "./tree.js";

let localSeq = 1;

export function nextLocalId(prefix = "local"): NodeId {
  return `${prefix}:${Date.now().toString(36)}_${localSeq++}`;
}

export type CreateShapeType =
  | "FRAME"
  | "RECTANGLE"
  | "ELLIPSE"
  | "TEXT"
  | "LINE"
  | "VECTOR"
  | "GROUP"
  | "COMPONENT"
  | "BOOLEAN_OPERATION";

export function baseNode(
  id: NodeId,
  type: NodeType,
  name: string,
  parentId: NodeId | null,
  x: number,
  y: number,
  w: number,
  h: number
): SceneNode {
  return {
    id,
    type,
    name,
    parentId,
    children: [],
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "PASS_THROUGH",
    transform: { ...identityMat(), m02: x, m12: y },
    size: { width: Math.max(1, w), height: Math.max(1, h) },
    fills:
      type === "FRAME"
        ? [solidPaint(1, 1, 1)]
        : type === "TEXT"
          ? [solidPaint(1, 1, 1)]
          : type === "LINE" || type === "VECTOR"
            ? []
            : [solidPaint(0.85, 0.85, 0.9)],
    strokes:
      type === "LINE" || type === "VECTOR"
        ? [solidPaint(0.2, 0.2, 0.25)]
        : [],
    strokeWeight: type === "LINE" || type === "VECTOR" ? 2 : 0,
    strokeAlign: "CENTER",
    effects: [],
    clipsContent: type === "FRAME" || type === "COMPONENT",
    constraints: { horizontal: "MIN", vertical: "MIN" },
    rotation: 0,
  };
}

export function createShapeInDocument(
  doc: AlteronDocument,
  type: CreateShapeType,
  worldX: number,
  worldY: number,
  width: number,
  height: number,
  options?: { parentId?: NodeId | null; name?: string; id?: NodeId }
): { doc: AlteronDocument; id: NodeId } {
  const pageId = doc.currentPageId;
  if (!pageId) return { doc, id: "" };

  const parentId = options?.parentId === undefined ? pageId : options.parentId;
  const id = options?.id ?? nextLocalId();
  const name =
    options?.name ??
    (type === "FRAME"
      ? "Frame"
      : type === "RECTANGLE"
        ? "Rectangle"
        : type === "ELLIPSE"
          ? "Ellipse"
          : type === "TEXT"
            ? "Text"
            : type === "LINE"
              ? "Line"
              : type === "VECTOR"
                ? "Vector"
                : type === "GROUP"
                  ? "Group"
                  : type === "COMPONENT"
                    ? "Component"
                    : "Boolean");

  let node = baseNode(id, type, name, parentId, worldX, worldY, width, height);

  if (type === "TEXT") {
    node = {
      ...node,
      type: "TEXT",
      characters: "Text",
      textStyle: {
        fontFamily: "Inter",
        fontStyle: "Regular",
        fontSize: 16,
      },
    } as TextNode;
  }

  if (type === "LINE") {
    node = {
      ...node,
      size: { width: Math.max(1, width), height: Math.max(1, height) },
      strokePaths: [
        {
          d: `M 0 0 L ${Math.max(1, width)} ${Math.max(0, height)}`,
          windingRule: "nonzero",
          paint: "stroke",
        },
      ],
      vectorNormalizedSize: {
        width: Math.max(1, width),
        height: Math.max(1, height),
      },
    };
  }

  const nodes = { ...doc.nodes, [id]: node };
  let pages = doc.pages;

  if (parentId === pageId || !parentId) {
    pages = doc.pages.map((p) =>
      p.id === pageId ? { ...p, children: [...p.children, id] } : p
    );
  } else if (nodes[parentId]) {
    const parent = nodes[parentId]!;
    nodes[parentId] = {
      ...parent,
      children: [...parent.children, id],
    };
  }

  const next: AlteronDocument = { ...doc, nodes, pages };
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return { doc: next, id };
}

/** Update a node’s size/position during drag-create (world top-left + size). */
export function updateNodeRect(
  doc: AlteronDocument,
  id: NodeId,
  x: number,
  y: number,
  w: number,
  h: number
): AlteronDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const next = {
    ...doc,
    nodes: {
      ...doc.nodes,
      [id]: {
        ...node,
        transform: { ...node.transform, m02: x, m12: y },
        size: { width: Math.max(1, w), height: Math.max(1, h) },
      },
    },
  };
  if (next.currentPageId) computeAbsoluteTransforms(next, next.currentPageId);
  return next;
}

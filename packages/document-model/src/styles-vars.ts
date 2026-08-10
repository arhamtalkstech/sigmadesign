/**
 * Shared styles and design variables (tokens).
 */
import type {
  AlteronDocument,
  Color,
  DesignStyle,
  DesignVariable,
  NodeId,
  Paint,
  TextStyle,
  VariableCollection,
} from "./types.js";
import { nextLocalId } from "./create-node.js";
import { updateNode } from "./tree.js";

export function ensureStyleBuckets(doc: AlteronDocument): AlteronDocument {
  return {
    ...doc,
    styles: doc.styles ?? {},
    variables: doc.variables ?? {},
    variableCollections: doc.variableCollections ?? {},
    activeModes: doc.activeModes ?? {},
  };
}

export function createFillStyle(
  doc: AlteronDocument,
  name: string,
  paints: Paint[]
): { doc: AlteronDocument; styleId: string } {
  let next = ensureStyleBuckets(doc);
  const id = nextLocalId("style");
  const style: DesignStyle = { id, name, kind: "FILL", paints };
  next = {
    ...next,
    styles: { ...next.styles, [id]: style },
  };
  return { doc: next, styleId: id };
}

export function createTextStyle(
  doc: AlteronDocument,
  name: string,
  textStyle: TextStyle
): { doc: AlteronDocument; styleId: string } {
  let next = ensureStyleBuckets(doc);
  const id = nextLocalId("style");
  const style: DesignStyle = { id, name, kind: "TEXT", textStyle };
  next = {
    ...next,
    styles: { ...next.styles, [id]: style },
  };
  return { doc: next, styleId: id };
}

export function applyFillStyle(
  doc: AlteronDocument,
  nodeId: NodeId,
  styleId: string
): AlteronDocument {
  const style = doc.styles?.[styleId];
  if (!style || style.kind !== "FILL" || !style.paints) return doc;
  return updateNode(doc, nodeId, {
    fills: style.paints,
    fillStyleId: styleId,
  });
}

export function applyTextStyle(
  doc: AlteronDocument,
  nodeId: NodeId,
  styleId: string
): AlteronDocument {
  const style = doc.styles?.[styleId];
  const node = doc.nodes[nodeId];
  if (!style || style.kind !== "TEXT" || !style.textStyle || !node) return doc;
  if (node.type !== "TEXT") return doc;
  return updateNode(doc, nodeId, {
    textStyle: style.textStyle,
    textStyleId: styleId,
  } as never);
}

export function createColorVariable(
  doc: AlteronDocument,
  name: string,
  color: Color,
  collectionName = "Tokens"
): { doc: AlteronDocument; variableId: string; collectionId: string } {
  let next = ensureStyleBuckets(doc);
  let collectionId = Object.values(next.variableCollections ?? {}).find(
    (c) => c.name === collectionName
  )?.id;
  if (!collectionId) {
    collectionId = nextLocalId("coll");
    const collection: VariableCollection = {
      id: collectionId,
      name: collectionName,
      modes: [{ id: "mode_default", name: "Default" }],
      variableIds: [],
    };
    next = {
      ...next,
      variableCollections: {
        ...next.variableCollections,
        [collectionId]: collection,
      },
      activeModes: { ...next.activeModes, [collectionId]: "mode_default" },
    };
  }
  const variableId = nextLocalId("var");
  const variable: DesignVariable = {
    id: variableId,
    name,
    resolvedType: "COLOR",
    defaultModeId: "mode_default",
    valuesByMode: { mode_default: color },
  };
  const coll = next.variableCollections![collectionId]!;
  next = {
    ...next,
    variables: { ...next.variables, [variableId]: variable },
    variableCollections: {
      ...next.variableCollections,
      [collectionId]: {
        ...coll,
        variableIds: [...coll.variableIds, variableId],
      },
    },
  };
  return { doc: next, variableId, collectionId };
}

export function resolveVariableColor(
  doc: AlteronDocument,
  variableId: string
): Color | null {
  const v = doc.variables?.[variableId];
  if (!v || v.resolvedType !== "COLOR") return null;
  const mode =
    Object.entries(doc.activeModes ?? {}).find(([collId]) =>
      doc.variableCollections?.[collId]?.variableIds.includes(variableId)
    )?.[1] ?? v.defaultModeId;
  const val = v.valuesByMode[mode] ?? v.valuesByMode[v.defaultModeId];
  if (val && typeof val === "object" && "r" in val) return val as Color;
  return null;
}

/** Apply a color variable as the node's solid fill (and remember binding). */
export function applyColorVariableAsFill(
  doc: AlteronDocument,
  nodeId: NodeId,
  variableId: string
): AlteronDocument {
  const color = resolveVariableColor(doc, variableId);
  if (!color) return doc;
  return updateNode(doc, nodeId, {
    fills: [
      {
        type: "SOLID",
        color,
        opacity: color.a ?? 1,
        visible: true,
        blendMode: "NORMAL",
      },
    ],
    fillVariableId: variableId,
  });
}

export function createFloatVariable(
  doc: AlteronDocument,
  name: string,
  value: number,
  collectionName = "Tokens"
): { doc: AlteronDocument; variableId: string; collectionId: string } {
  let next = ensureStyleBuckets(doc);
  let collectionId = Object.values(next.variableCollections ?? {}).find(
    (c) => c.name === collectionName
  )?.id;
  if (!collectionId) {
    collectionId = nextLocalId("coll");
    const collection: VariableCollection = {
      id: collectionId,
      name: collectionName,
      modes: [{ id: "mode_default", name: "Default" }],
      variableIds: [],
    };
    next = {
      ...next,
      variableCollections: {
        ...next.variableCollections,
        [collectionId]: collection,
      },
      activeModes: { ...next.activeModes, [collectionId]: "mode_default" },
    };
  }
  const variableId = nextLocalId("var");
  const variable: DesignVariable = {
    id: variableId,
    name,
    resolvedType: "FLOAT",
    defaultModeId: "mode_default",
    valuesByMode: { mode_default: value },
  };
  const coll = next.variableCollections![collectionId]!;
  next = {
    ...next,
    variables: { ...next.variables, [variableId]: variable },
    variableCollections: {
      ...next.variableCollections,
      [collectionId]: {
        ...coll,
        variableIds: [...coll.variableIds, variableId],
      },
    },
  };
  return { doc: next, variableId, collectionId };
}

export function setVariableModeValue(
  doc: AlteronDocument,
  variableId: string,
  modeId: string,
  value: Color | number | string | boolean
): AlteronDocument {
  const v = doc.variables?.[variableId];
  if (!v) return doc;
  return {
    ...doc,
    variables: {
      ...doc.variables,
      [variableId]: {
        ...v,
        valuesByMode: { ...v.valuesByMode, [modeId]: value },
      },
    },
  };
}

export function addVariableMode(
  doc: AlteronDocument,
  collectionId: string,
  modeName: string
): { doc: AlteronDocument; modeId: string } {
  const coll = doc.variableCollections?.[collectionId];
  if (!coll) return { doc, modeId: "" };
  const modeId = nextLocalId("mode");
  const next: AlteronDocument = {
    ...doc,
    variableCollections: {
      ...doc.variableCollections,
      [collectionId]: {
        ...coll,
        modes: [...coll.modes, { id: modeId, name: modeName }],
      },
    },
  };
  // Copy default mode values into new mode for each variable
  const variables = { ...next.variables };
  for (const vid of coll.variableIds) {
    const v = variables[vid];
    if (!v) continue;
    const fallback = v.valuesByMode[v.defaultModeId];
    variables[vid] = {
      ...v,
      valuesByMode: { ...v.valuesByMode, [modeId]: fallback },
    };
  }
  return {
    doc: { ...next, variables },
    modeId,
  };
}

export function resolveVariableFloat(
  doc: AlteronDocument,
  variableId: string
): number | null {
  const v = doc.variables?.[variableId];
  if (!v || v.resolvedType !== "FLOAT") return null;
  const mode =
    Object.entries(doc.activeModes ?? {}).find(([collId]) =>
      doc.variableCollections?.[collId]?.variableIds.includes(variableId)
    )?.[1] ?? v.defaultModeId;
  const val = v.valuesByMode[mode] ?? v.valuesByMode[v.defaultModeId];
  return typeof val === "number" ? val : null;
}

/**
 * Re-resolve all nodes bound to variables after a mode switch.
 */
export function rebindVariablesOnDocument(doc: AlteronDocument): AlteronDocument {
  let next = doc;
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.fillVariableId || node.fillVariableId === "") {
      /* ignore */
    }
    if (node.fillVariableId) {
      const color = resolveVariableColor(next, node.fillVariableId);
      if (color) {
        next = updateNode(next, id, {
          fills: [
            {
              type: "SOLID",
              color,
              opacity: color.a ?? 1,
              visible: true,
              blendMode: "NORMAL",
            },
          ],
        });
      }
    }
    if (node.opacityVariableId) {
      const f = resolveVariableFloat(next, node.opacityVariableId);
      if (f != null) {
        next = updateNode(next, id, {
          opacity: Math.min(1, Math.max(0, f)),
        });
      }
    }
    if (node.strokeVariableId) {
      const color = resolveVariableColor(next, node.strokeVariableId);
      if (color) {
        const strokes =
          node.strokes.length > 0
            ? node.strokes.map((s) =>
                s.type === "SOLID" ? { ...s, color } : s
              )
            : [
                {
                  type: "SOLID" as const,
                  color,
                  opacity: 1,
                  visible: true,
                  blendMode: "NORMAL" as const,
                },
              ];
        next = updateNode(next, id, { strokes, strokeWeight: node.strokeWeight || 1 });
      }
    }
  }
  return next;
}

export function setActiveMode(
  doc: AlteronDocument,
  collectionId: string,
  modeId: string
): AlteronDocument {
  const next = {
    ...doc,
    activeModes: { ...doc.activeModes, [collectionId]: modeId },
  };
  return rebindVariablesOnDocument(next);
}

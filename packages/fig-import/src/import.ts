import {
  finalizeLayout,
  type AlteronDocument,
  type Color,
  type NodeId,
  type Page,
  type SceneNode,
} from "@alteron/document-model";
import {
  guidToString,
  readFigFile,
  resolveNodePaths,
  type DecodedFigFile,
  type FigNodeChange,
} from "@alteron/fig-format";
import { expandAllInstances } from "./expand-instances.js";
import { mapFigNode } from "./map-node.js";

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function detectMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  return "application/octet-stream";
}

/**
 * Build parent → ordered children from flat nodeChanges.
 * Order uses Figma fractional `parentIndex.position` string sort.
 */
export function buildChildMap(
  nodes: FigNodeChange[]
): Map<string, Array<{ id: string; position: string }>> {
  const map = new Map<string, Array<{ id: string; position: string }>>();
  for (const n of nodes) {
    if (!n.parentIndex) continue;
    const parentId = guidToString(n.parentIndex.guid);
    const id = guidToString(n.guid);
    const position = n.parentIndex.position ?? "";
    const list = map.get(parentId) ?? [];
    list.push({ id, position });
    map.set(parentId, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0
    );
  }
  return map;
}

export function decodedFigToDocument(decoded: DecodedFigFile): AlteronDocument {
  const rawNodes = decoded.message.nodeChanges ?? [];
  const rawChildMap = buildChildMap(rawNodes);

  // Expand INSTANCE → SYMBOL subtrees (Figma does not store instance children)
  const { nodes: figNodes, childMap } = expandAllInstances(
    rawNodes,
    rawChildMap
  );

  const nodes: Record<NodeId, SceneNode> = {};
  const pages: Page[] = [];
  const components: AlteronDocument["components"] = {};

  const blobs = (decoded.message.blobs ?? []) as Array<{ bytes?: Uint8Array }>;

  // Map every node (children resolved via childMap) + decode vector paths
  for (const n of figNodes) {
    const id = guidToString(n.guid);
    const childEntries = childMap.get(id) ?? [];
    const childIds = childEntries.map((c) => c.id);

    const resolved = resolveNodePaths(
      {
        fillGeometry: n.fillGeometry as never,
        strokeGeometry: n.strokeGeometry as never,
        vectorData: n.vectorData as never,
        fillPaints: n.fillPaints as never,
        strokePaints: n.strokePaints as never,
        strokeWeight: n.strokeWeight,
      },
      blobs
    );
    const pathAttach =
      resolved.fillPaths.length || resolved.strokePaths.length
        ? {
            fillPaths: resolved.fillPaths.map((p) => ({
              d: p.d,
              windingRule: p.windingRule,
              paint: p.paint,
            })),
            strokePaths: resolved.strokePaths.map((p) => ({
              d: p.d,
              windingRule: p.windingRule,
              // Figma strokeGeometry → fill outline; vector-network → centerline stroke
              paint: p.paint,
            })),
            vectorNormalizedSize: resolved.normalizedSize,
          }
        : undefined;

    const mapped = mapFigNode(n, childIds, pathAttach);
    nodes[id] = mapped;

    if (mapped.type === "COMPONENT") {
      components[id] = {
        id,
        name: mapped.name,
        key: "componentKey" in mapped ? mapped.componentKey : undefined,
      };
    }
  }

  // Sync children from childMap (authoritative after expansion)
  for (const [id, kids] of childMap) {
    const node = nodes[id];
    if (node) node.children = kids.map((k) => k.id);
  }

  // Pages from CANVAS nodes under DOCUMENT
  const canvasNodes = figNodes.filter((n) => n.type === "CANVAS");

  const bg: Color = decoded.meta.client_meta?.background_color
    ? {
        r: decoded.meta.client_meta.background_color.r,
        g: decoded.meta.client_meta.background_color.g,
        b: decoded.meta.client_meta.background_color.b,
        a: decoded.meta.client_meta.background_color.a ?? 1,
      }
    : { r: 0.12, g: 0.12, b: 0.12, a: 1 };

  for (const canvas of canvasNodes) {
    const id = guidToString(canvas.guid);
    const childEntries = childMap.get(id) ?? [];
    const isInternal =
      canvas.name?.toLowerCase().includes("internal") ||
      canvas.visible === false;
    pages.push({
      id,
      name: canvas.name ?? "Page",
      children: childEntries.map((c) => c.id),
      background: bg,
      internal: isInternal,
    });
  }

  // Prefer first non-internal page
  const currentPageId =
    pages.find((p) => !p.internal)?.id ?? pages[0]?.id ?? null;

  // Assets — create data URLs for images (browser + server).
  // Large libraries: prefer blob URLs at the app layer if memory is tight.
  const assets: AlteronDocument["assets"] = {};
  for (const [hash, bytes] of decoded.images) {
    const mimeType = detectMime(bytes);
    // Skip tiny broken placeholders
    if (bytes.byteLength < 8) {
      assets[hash] = { hash, mimeType, byteLength: bytes.byteLength };
      continue;
    }
    const b64 = bytesToBase64(bytes);
    assets[hash] = {
      hash,
      mimeType,
      dataUrl: `data:${mimeType};base64,${b64}`,
      byteLength: bytes.byteLength,
    };
  }

  const doc: AlteronDocument = {
    version: 1,
    name: decoded.meta.file_name ?? "Imported",
    meta: {
      backgroundColor: bg,
      renderCoordinates: decoded.meta.client_meta?.render_coordinates,
      thumbnailSize: decoded.meta.client_meta?.thumbnail_size,
      exportedAt: decoded.meta.exported_at,
      source: "figma-fig",
    },
    nodes,
    pages,
    currentPageId,
    assets,
    figmaSchemaBase64: bytesToBase64(decoded.schemaBytes),
    components,
  };

  // Absolute transforms + clamp oversized instance children (auto-layout)
  if (currentPageId) {
    finalizeLayout(doc, currentPageId);
  }

  return doc;
}

export async function importFigFile(
  input: ArrayBuffer | Uint8Array
): Promise<AlteronDocument> {
  const decoded = await readFigFile(input);
  return decodedFigToDocument(decoded);
}

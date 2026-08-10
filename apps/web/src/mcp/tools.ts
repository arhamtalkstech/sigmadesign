/**
 * SigmaDesign agent tool handlers — pure library/ADM operations.
 * Shared by the MCP server and unit tests (no transport coupling).
 *
 * Server-only: do not import this module from client components
 * (use `@/mcp/tool-catalog` for browser-safe names/descriptions).
 */
import {
  applyNodePatch,
  createShapeInDocument,
  setAutoLayout,
  type AlteronDocument,
  type NodeId,
  type SceneNode,
} from "@alteron/document-model";
import {
  getLibraryInfo,
  openLibraryFile,
  saveLibraryDocument,
  type LibraryListItem,
} from "@/server/library-service";
import { getSigmaHome } from "@/server/paths";
import { TOOL_CATALOG } from "./tool-catalog.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function err(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/** Serialize node for agent context (drop huge path blobs unless needed). */
export function summarizeNode(
  node: SceneNode,
  options?: { includePaths?: boolean; maxPathLen?: number }
): Record<string, unknown> {
  const maxPath = options?.maxPathLen ?? 400;
  const base: Record<string, unknown> = {
    id: node.id,
    type: node.type,
    name: node.name,
    parentId: node.parentId,
    children: node.children,
    visible: node.visible,
    locked: node.locked,
    opacity: node.opacity,
    blendMode: node.blendMode,
    size: node.size,
    transform: node.transform,
    absoluteBounds: node.absoluteBounds,
    fills: node.fills,
    strokes: node.strokes,
    strokeWeight: node.strokeWeight,
    strokeAlign: node.strokeAlign,
    effects: node.effects,
    cornerRadius: node.cornerRadius,
    clipsContent: node.clipsContent,
    layout: node.layout,
    constraints: node.constraints,
    rotation: node.rotation,
    layoutGrow: node.layoutGrow,
    layoutAlign: node.layoutAlign,
    fillStyleId: node.fillStyleId,
    fillVariableId: node.fillVariableId,
  };
  if (node.type === "TEXT" && "characters" in node) {
    base.characters = node.characters;
    base.textStyle = node.textStyle;
  }
  if (node.type === "INSTANCE" || node.type === "COMPONENT") {
    base.componentId = "componentId" in node ? node.componentId : undefined;
    base.componentKey = "componentKey" in node ? node.componentKey : undefined;
  }
  if (options?.includePaths) {
    if (node.fillPaths?.length) {
      base.fillPaths = node.fillPaths.map((p) => ({
        ...p,
        d: p.d.length > maxPath ? p.d.slice(0, maxPath) + "…" : p.d,
      }));
    }
    if (node.strokePaths?.length) {
      base.strokePaths = node.strokePaths.map((p) => ({
        ...p,
        d: p.d.length > maxPath ? p.d.slice(0, maxPath) + "…" : p.d,
      }));
    }
  } else {
    base.hasVectorGeometry = Boolean(
      (node.fillPaths?.length ?? 0) + (node.strokePaths?.length ?? 0)
    );
  }
  return base;
}

export function collectSubtree(
  doc: AlteronDocument,
  rootId: NodeId,
  depth: number,
  options?: { includePaths?: boolean }
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (id: NodeId, d: number) => {
    const n = doc.nodes[id];
    if (!n) return;
    out.push({ ...summarizeNode(n, options), depth: d });
    if (d >= depth) return;
    for (const c of n.children) walk(c, d + 1);
  };
  walk(rootId, 0);
  return out;
}

/** Full definitions for MCP registration + API (server-only). */
export const TOOL_DEFINITIONS = TOOL_CATALOG.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: {
    type: "object" as const,
    properties: {} as Record<string, unknown>,
  },
}));

export type ToolName = (typeof TOOL_CATALOG)[number]["name"];

export function listToolNames(): string[] {
  return TOOL_CATALOG.map((t) => t.name);
}

async function loadDoc(fileId: string): Promise<AlteronDocument> {
  const result = await openLibraryFile(fileId);
  return result.doc;
}

function colorCss(c: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = c.a ?? 1;
  if (a < 1) return `rgba(${r},${g},${b},${a})`;
  return `rgb(${r},${g},${b})`;
}

function codeHintsForNode(node: SceneNode, children: SceneNode[]): Record<string, unknown> {
  const solid = node.fills.find((f) => f.type === "SOLID" && f.visible !== false) as
    | { color: { r: number; g: number; b: number; a?: number } }
    | undefined;
  const hints: Record<string, unknown> = {
    suggestedTag:
      node.type === "TEXT"
        ? "p"
        : node.type === "FRAME" || node.type === "GROUP"
          ? "div"
          : node.type === "ELLIPSE"
            ? "div.ellipse"
            : "div",
    name: node.name,
    size: node.size,
    layout: node.layout ?? null,
    background: solid ? colorCss(solid.color) : null,
    opacity: node.opacity,
    borderRadius:
      typeof node.cornerRadius === "number"
        ? node.cornerRadius
        : node.cornerRadius ?? null,
    children: children.map((c) => c.name),
  };
  if (node.type === "TEXT" && "characters" in node) {
    hints.text = node.characters;
    hints.font = node.textStyle;
  }
  if (node.layout?.mode === "HORIZONTAL" || node.layout?.mode === "VERTICAL") {
    hints.cssDisplay = "flex";
    hints.cssFlexDirection =
      node.layout.mode === "HORIZONTAL" ? "row" : "column";
    hints.cssGap = node.layout.gap;
    hints.cssPadding = node.layout.padding;
  }
  return hints;
}

/** Simple PNG export via node-canvas when available. */
async function exportPngBase64(
  doc: AlteronDocument,
  nodeIds: string[],
  scale: number
): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    // Dynamic import — canvas is optional native dep
    const { createCanvas } = await import("canvas");
    const { renderScene } = await import("@/lib/render-engine");

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const id of nodeIds) {
      const b = doc.nodes[id]?.absoluteBounds;
      if (!b) continue;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 400;
      maxY = 300;
    }
    const pad = 8;
    const worldW = Math.max(1, maxX - minX + pad * 2);
    const worldH = Math.max(1, maxY - minY + pad * 2);
    const w = Math.min(2048, Math.ceil(worldW * scale));
    const h = Math.min(2048, Math.ceil(worldH * scale));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    renderScene(
      ctx as unknown as CanvasRenderingContext2D,
      doc,
      {
        x: -minX * scale + pad * scale,
        y: -minY * scale + pad * scale,
        zoom: scale,
      },
      w,
      h,
      { selection: [] }
    );
    const buf = canvas.toBuffer("image/png");
    return { base64: buf.toString("base64"), width: w, height: h };
  } catch {
    return null;
  }
}

export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case "list_library_files": {
        const info = getLibraryInfo();
        return ok({
          home: info.home,
          files: info.files.map((f: LibraryListItem) => ({
            id: f.id,
            name: f.name,
            nodeCount: f.nodeCount,
            pageCount: f.pageCount,
            byteSize: f.byteSize,
            updatedAt: f.updatedAt,
            sourceFormat: f.sourceFormat,
          })),
        });
      }
      case "get_library_info": {
        const info = getLibraryInfo();
        return ok({
          home: getSigmaHome(),
          libraryDir: info.libraryDir,
          fileCount: info.files.length,
          totalNodes: info.files.reduce((s, f) => s + f.nodeCount, 0),
        });
      }
      case "open_document": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const opened = await openLibraryFile(fileId);
        const doc = opened.doc;
        return ok({
          id: opened.id,
          name: opened.name,
          fromCache: opened.fromCache,
          pageCount: doc.pages.length,
          nodeCount: Object.keys(doc.nodes).length,
          currentPageId: doc.currentPageId,
          pages: doc.pages.map((p) => ({
            id: p.id,
            name: p.name,
            childCount: p.children.length,
            internal: p.internal ?? false,
          })),
          styleCount: Object.keys(doc.styles ?? {}).length,
          variableCount: Object.keys(doc.variables ?? {}).length,
          componentCount: Object.keys(doc.components ?? {}).length,
          commentCount: Object.keys(doc.comments ?? {}).length,
          assetCount: Object.keys(doc.assets ?? {}).length,
        });
      }
      case "get_design_context": {
        const fileId = String(args.fileId ?? "");
        const nodeId = String(args.nodeId ?? "");
        const depth = Math.min(12, Math.max(0, Number(args.depth ?? 4)));
        if (!fileId || !nodeId) return err("fileId and nodeId required");
        const doc = await loadDoc(fileId);
        if (!doc.nodes[nodeId]) return err(`Node not found: ${nodeId}`);
        const tree = collectSubtree(doc, nodeId, depth, {
          includePaths: Boolean(args.includePaths),
        });
        return ok({
          fileId,
          rootId: nodeId,
          depth,
          nodeCount: tree.length,
          nodes: tree,
        });
      }
      case "get_node": {
        const fileId = String(args.fileId ?? "");
        const nodeId = String(args.nodeId ?? "");
        if (!fileId || !nodeId) return err("fileId and nodeId required");
        const doc = await loadDoc(fileId);
        const n = doc.nodes[nodeId];
        if (!n) return err(`Node not found: ${nodeId}`);
        return ok(
          summarizeNode(n, { includePaths: Boolean(args.includePaths) })
        );
      }
      case "search_layers": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const q = String(args.query ?? "").toLowerCase();
        const typeFilter = args.type ? String(args.type).toUpperCase() : null;
        const limit = Math.min(200, Math.max(1, Number(args.limit ?? 50)));
        const doc = await loadDoc(fileId);
        const hits: Array<Record<string, unknown>> = [];
        for (const n of Object.values(doc.nodes)) {
          if (typeFilter && n.type !== typeFilter) continue;
          if (q && !n.name.toLowerCase().includes(q)) continue;
          hits.push({
            id: n.id,
            name: n.name,
            type: n.type,
            parentId: n.parentId,
            bounds: n.absoluteBounds,
          });
          if (hits.length >= limit) break;
        }
        return ok({ count: hits.length, results: hits });
      }
      case "list_pages": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const doc = await loadDoc(fileId);
        return ok({
          currentPageId: doc.currentPageId,
          pages: doc.pages.map((p) => ({
            id: p.id,
            name: p.name,
            children: p.children,
            internal: p.internal ?? false,
            background: p.background,
          })),
        });
      }
      case "list_components": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const doc = await loadDoc(fileId);
        return ok({ components: doc.components ?? {} });
      }
      case "get_styles": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const doc = await loadDoc(fileId);
        return ok({ styles: doc.styles ?? {} });
      }
      case "get_variables": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const doc = await loadDoc(fileId);
        return ok({
          variables: doc.variables ?? {},
          collections: doc.variableCollections ?? {},
          activeModes: doc.activeModes ?? {},
        });
      }
      case "get_comments": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const doc = await loadDoc(fileId);
        return ok({ comments: doc.comments ?? {} });
      }
      case "get_screenshot": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const doc = await loadDoc(fileId);
        const scale = Math.min(3, Math.max(0.5, Number(args.scale ?? 1)));
        let ids: string[] = [];
        if (args.nodeId) {
          ids = [String(args.nodeId)];
        } else {
          const page = doc.pages.find((p) => p.id === doc.currentPageId);
          ids = page?.children ?? [];
        }
        if (!ids.length) return err("No nodes to export");
        const png = await exportPngBase64(doc, ids, scale);
        if (!png) {
          // Fallback: bounds + structure (no fake pixels)
          const bounds = ids.map((id) => ({
            id,
            bounds: doc.nodes[id]?.absoluteBounds ?? null,
          }));
          return ok({
            note: "Pixel export unavailable in this environment; returning bounds only. Use export_node_json for structure.",
            bounds,
          });
        }
        return {
          content: [
            {
              type: "image",
              data: png.base64,
              mimeType: "image/png",
            },
            {
              type: "text",
              text: JSON.stringify({
                width: png.width,
                height: png.height,
                nodeIds: ids,
              }),
            },
          ],
        };
      }
      case "export_node_json": {
        const fileId = String(args.fileId ?? "");
        const nodeId = String(args.nodeId ?? "");
        const depth = Math.min(12, Math.max(0, Number(args.depth ?? 6)));
        if (!fileId || !nodeId) return err("fileId and nodeId required");
        const doc = await loadDoc(fileId);
        if (!doc.nodes[nodeId]) return err(`Node not found: ${nodeId}`);
        return ok({
          fileId,
          root: collectSubtree(doc, nodeId, depth, { includePaths: true }),
        });
      }
      case "update_node": {
        const fileId = String(args.fileId ?? "");
        const nodeId = String(args.nodeId ?? "");
        const patch = (args.patch ?? {}) as Partial<SceneNode>;
        if (!fileId || !nodeId) return err("fileId and nodeId required");
        const opened = await openLibraryFile(fileId);
        let doc = opened.doc;
        if (!doc.nodes[nodeId]) return err(`Node not found: ${nodeId}`);
        doc = applyNodePatch(doc, nodeId, patch);
        saveLibraryDocument(fileId, doc);
        return ok({
          ok: true,
          node: summarizeNode(doc.nodes[nodeId]!),
        });
      }
      case "create_rectangle": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const opened = await openLibraryFile(fileId);
        let doc = opened.doc;
        const r = createShapeInDocument(
          doc,
          "RECTANGLE",
          Number(args.x ?? 0),
          Number(args.y ?? 0),
          Number(args.width ?? 100),
          Number(args.height ?? 100),
          { name: args.name ? String(args.name) : "Rectangle" }
        );
        doc = r.doc;
        saveLibraryDocument(fileId, doc);
        return ok({ ok: true, id: r.id, node: summarizeNode(doc.nodes[r.id]!) });
      }
      case "create_text": {
        const fileId = String(args.fileId ?? "");
        if (!fileId) return err("fileId required");
        const opened = await openLibraryFile(fileId);
        let doc = opened.doc;
        const r = createShapeInDocument(
          doc,
          "TEXT",
          Number(args.x ?? 0),
          Number(args.y ?? 0),
          200,
          24,
          { name: args.name ? String(args.name) : "Text" }
        );
        doc = r.doc;
        if (r.id && doc.nodes[r.id]) {
          doc = applyNodePatch(doc, r.id, {
            characters: String(args.characters ?? "Text"),
            textStyle: {
              fontFamily: "Inter",
              fontStyle: "Regular",
              fontSize: Number(args.fontSize ?? 16),
            },
          } as Partial<SceneNode>);
        }
        saveLibraryDocument(fileId, doc);
        return ok({
          ok: true,
          id: r.id,
          node: r.id ? summarizeNode(doc.nodes[r.id]!) : null,
        });
      }
      case "set_node_auto_layout": {
        const fileId = String(args.fileId ?? "");
        const nodeId = String(args.nodeId ?? "");
        const mode = String(args.mode ?? "NONE") as
          | "NONE"
          | "HORIZONTAL"
          | "VERTICAL";
        if (!fileId || !nodeId) return err("fileId and nodeId required");
        const opened = await openLibraryFile(fileId);
        let doc = opened.doc;
        const pad = Number(args.padding ?? 8);
        doc = setAutoLayout(doc, nodeId, {
          mode,
          gap: Number(args.gap ?? 8),
          padding: { top: pad, right: pad, bottom: pad, left: pad },
        });
        saveLibraryDocument(fileId, doc);
        return ok({
          ok: true,
          node: summarizeNode(doc.nodes[nodeId]!),
        });
      }
      case "rename_node": {
        const fileId = String(args.fileId ?? "");
        const nodeId = String(args.nodeId ?? "");
        const name = String(args.name ?? "").trim();
        if (!fileId || !nodeId || !name) return err("fileId, nodeId, name required");
        const opened = await openLibraryFile(fileId);
        let doc = opened.doc;
        doc = applyNodePatch(doc, nodeId, { name });
        saveLibraryDocument(fileId, doc);
        return ok({ ok: true, id: nodeId, name });
      }
      case "get_code_hints": {
        const fileId = String(args.fileId ?? "");
        const nodeId = String(args.nodeId ?? "");
        const depth = Math.min(6, Math.max(0, Number(args.depth ?? 2)));
        if (!fileId || !nodeId) return err("fileId and nodeId required");
        const doc = await loadDoc(fileId);
        const root = doc.nodes[nodeId];
        if (!root) return err(`Node not found: ${nodeId}`);
        const kids = root.children
          .map((id) => doc.nodes[id])
          .filter(Boolean) as SceneNode[];
        const tree = collectSubtree(doc, nodeId, depth);
        return ok({
          root: codeHintsForNode(root, kids),
          subtreeHints: tree.slice(0, 40).map((t) => {
            const id = String(t.id);
            const n = doc.nodes[id];
            if (!n) return t;
            const c = n.children
              .map((cid) => doc.nodes[cid])
              .filter(Boolean) as SceneNode[];
            return codeHintsForNode(n, c);
          }),
          guidance: [
            "1. Use get_design_context for the full subtree before coding.",
            "2. Map FRAME+auto-layout to flex containers; TEXT to typography tokens.",
            "3. Resolve variables/styles via get_variables and get_styles.",
            "4. Verify with get_screenshot or export_node_json after implementation.",
          ],
        });
      }
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

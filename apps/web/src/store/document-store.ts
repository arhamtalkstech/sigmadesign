"use client";

import { create } from "zustand";
import {
  computeAbsoluteTransforms,
  createEmptyDocument,
  finalizeLayout,
  hitTest,
  identityMat,
  updateNode,
  type AlteronDocument,
  type NodeId,
  type SceneNode,
} from "@alteron/document-model";
import { importFigFile, decodedFigToDocument } from "@alteron/fig-import";
import {
  decodeFigmaClipboard,
  isFigmaClipboardHtml,
} from "@alteron/fig-format";
import {
  importFileToLibrary,
  openLibraryFile,
  saveLibrarySession,
} from "@/lib/library-api";
import {
  applyContextMenuAction,
  type ContextMenuActionId,
} from "@/lib/context-menu-actions";

export type Tool =
  | "move"
  | "hand"
  | "frame"
  | "rectangle"
  | "ellipse"
  | "text"
  | "pen"
  | "comment";

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface HistoryEntry {
  doc: AlteronDocument;
}

interface DocumentState {
  doc: AlteronDocument;
  selection: NodeId[];
  tool: Tool;
  viewport: Viewport;
  status: string;
  loading: boolean;
  expanded: Record<NodeId, boolean>;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Active library file id (SQLite + ~/.sigmadesign) */
  libraryFileId: string | null;

  setTool: (tool: Tool) => void;
  setViewport: (v: Partial<Viewport>) => void;
  setStatus: (s: string) => void;
  setSelection: (ids: NodeId[]) => void;
  toggleExpanded: (id: NodeId) => void;
  setPage: (pageId: NodeId) => void;

  importFigBuffer: (
    buffer: ArrayBuffer,
    fileName?: string,
    options?: { focusNodeId?: string; skipLibrary?: boolean }
  ) => Promise<void>;
  /** Import into library (.sig); returns library file id for routing */
  importToLibraryAndOpen: (file: File) => Promise<string>;
  /** Open existing library file by id (uses ADM cache when available) */
  openFromLibrary: (id: string) => Promise<void>;
  /** Debounced session persist to SQLite */
  persistSession: () => void;
  /** Paste design clipboard HTML (format interop; marker not user-facing) */
  pasteDesignHtml: (html: string) => Promise<void>;
  newDocument: () => void;
  focusNode: (nodeId: NodeId, canvasW?: number, canvasH?: number) => void;

  selectAtPoint: (worldX: number, worldY: number, additive?: boolean) => void;
  patchSelected: (patch: Partial<SceneNode>) => void;
  moveSelected: (dx: number, dy: number) => void;
  createNodeAt: (
    type: "FRAME" | "RECTANGLE" | "ELLIPSE" | "TEXT",
    worldX: number,
    worldY: number
  ) => void;
  loadDocument: (doc: AlteronDocument) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  /** Context-menu / layer style actions */
  toggleVisibility: (ids?: NodeId[]) => void;
  deleteSelection: (ids?: NodeId[]) => void;
  duplicateSelection: (ids?: NodeId[]) => void;
  bringToFront: (ids?: NodeId[]) => void;
  sendToBack: (ids?: NodeId[]) => void;
  applyMenuAction: (
    targetId: NodeId,
    action: import("@/lib/context-menu-actions").ContextMenuActionId
  ) => void;
}

let localIdCounter = 100000;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function cloneDoc(doc: AlteronDocument): AlteronDocument {
  return structuredClone(doc);
}

function defaultViewport(doc: AlteronDocument): Viewport {
  if (doc.meta.renderCoordinates) {
    const rc = doc.meta.renderCoordinates;
    return {
      x: -rc.x * 0.15 + 100,
      y: -rc.y * 0.15 + 100,
      zoom: Math.min(0.4, 1200 / Math.max(rc.width, 1)),
    };
  }
  return { x: 80, y: 80, zoom: 0.2 };
}

function topExpanded(doc: AlteronDocument): Record<NodeId, boolean> {
  const expanded: Record<NodeId, boolean> = {};
  const page = doc.pages.find((p) => p.id === doc.currentPageId);
  if (page) {
    for (const id of page.children.slice(0, 12)) expanded[id] = true;
  }
  return expanded;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: createEmptyDocument("Untitled"),
  selection: [],
  tool: "move",
  viewport: { x: 0, y: 0, zoom: 0.25 },
  status: "Welcome to SigmaDesign",
  loading: false,
  expanded: {},
  past: [],
  future: [],
  libraryFileId: null,

  setTool: (tool) => set({ tool }),
  setViewport: (v) => {
    set((s) => ({ viewport: { ...s.viewport, ...v } }));
    get().persistSession();
  },
  setStatus: (status) => set({ status }),
  setSelection: (selection) => {
    set({ selection });
    get().persistSession();
  },
  toggleExpanded: (id) => {
    set((s) => ({
      expanded: { ...s.expanded, [id]: !s.expanded[id] },
    }));
    get().persistSession();
  },
  setPage: (pageId) => {
    const doc = { ...get().doc, currentPageId: pageId };
    finalizeLayout(doc, pageId);
    set({ doc, selection: [] });
    get().persistSession();
  },

  pushHistory: () => {
    const { doc, past } = get();
    set({
      past: [...past.slice(-49), { doc: cloneDoc(doc) }],
      future: [],
    });
  },

  newDocument: () => {
    set({
      doc: createEmptyDocument("Untitled"),
      selection: [],
      past: [],
      future: [],
      libraryFileId: null,
      status: "New document — import a design file to save into your library",
      viewport: { x: 80, y: 80, zoom: 1 },
      expanded: {},
    });
  },

  focusNode: (nodeId, canvasW = 1100, canvasH = 800) => {
    const { doc } = get();
    const node = doc.nodes[nodeId];
    const b = node?.absoluteBounds;
    if (!b || b.width <= 0 || b.height <= 0) return;
    const pad = 48;
    const zoom = Math.min(
      (canvasW - pad * 2) / b.width,
      (canvasH - pad * 2) / b.height,
      2
    );
    const vx = (canvasW - b.width * zoom) / 2 - b.x * zoom;
    const vy = (canvasH - b.height * zoom) / 2 - b.y * zoom;
    set({
      viewport: { x: vx, y: vy, zoom },
      selection: [nodeId],
    });
    get().persistSession();
  },

  persistSession: () => {
    const { libraryFileId, viewport, doc, expanded, selection } = get();
    if (!libraryFileId) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const expandedIds = Object.entries(expanded)
        .filter(([, v]) => v)
        .map(([k]) => k);
      void saveLibrarySession(libraryFileId, {
        viewport,
        currentPageId: doc.currentPageId,
        expanded: expandedIds,
        selection,
      }).catch(() => {
        /* offline / server restart — non-fatal */
      });
    }, 400);
  },

  openFromLibrary: async (id) => {
    set({ loading: true, status: "Opening from library…" });
    try {
      const result = await openLibraryFile(id);
      const doc = result.doc;
      if (doc.currentPageId) {
        finalizeLayout(doc, doc.currentPageId);
      }

      let expanded: Record<NodeId, boolean> = topExpanded(doc);
      if (result.expanded?.length) {
        expanded = { ...expanded };
        for (const eid of result.expanded) expanded[eid] = true;
      }

      const viewport = result.viewport ?? defaultViewport(doc);

      set({
        doc,
        libraryFileId: result.id,
        selection: result.selection ?? [],
        viewport,
        expanded,
        past: [],
        future: [],
        loading: false,
        status: `Opened “${result.name}” · ${Object.keys(doc.nodes).length.toLocaleString()} nodes${
          result.fromCache ? " · cache hit" : " · imported"
        }`,
      });
    } catch (err) {
      console.error(err);
      set({
        loading: false,
        status: `Open failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }
  },

  importToLibraryAndOpen: async (file) => {
    set({
      loading: true,
      status: `Importing ${file.name} into library as .sig…`,
    });
    try {
      const item = await importFileToLibrary(file);
      await get().openFromLibrary(item.id);
      return item.id;
    } catch (err) {
      console.error(err);
      set({
        loading: false,
        status: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }
  },

  importFigBuffer: async (buffer, fileName, options) => {
    // Prefer library path unless skipLibrary (tests / one-off)
    if (!options?.skipLibrary && typeof File !== "undefined" && fileName) {
      const file = new File([buffer], fileName, {
        type: "application/octet-stream",
      });
      await get().importToLibraryAndOpen(file);
      if (options?.focusNodeId) {
        get().focusNode(options.focusNodeId);
      }
      return;
    }

    set({ loading: true, status: "Importing design file…" });
    try {
      const doc = await importFigFile(buffer);
      if (fileName) doc.name = fileName.replace(/\.(fig|sig)$/i, "");

      let viewport = defaultViewport(doc);
      const focusId = options?.focusNodeId;
      const page = doc.pages.find((p) => p.id === doc.currentPageId);
      const expanded = topExpanded(doc);

      if (focusId && doc.nodes[focusId]?.absoluteBounds) {
        const b = doc.nodes[focusId]!.absoluteBounds!;
        const canvasW = 1100;
        const canvasH = 800;
        const pad = 48;
        const zoom = Math.min(
          (canvasW - pad * 2) / b.width,
          (canvasH - pad * 2) / b.height,
          1.25
        );
        viewport = {
          x: (canvasW - b.width * zoom) / 2 - b.x * zoom,
          y: (canvasH - b.height * zoom) / 2 - b.y * zoom,
          zoom,
        };
        let p: string | null | undefined = doc.nodes[focusId]?.parentId;
        while (p) {
          const n = doc.nodes[p];
          if (!n) break;
          if (n.type === "PAGE") {
            doc.currentPageId = p;
            break;
          }
          p = n.parentId;
        }
        let cur: string | null | undefined = focusId;
        while (cur) {
          expanded[cur] = true;
          cur = doc.nodes[cur]?.parentId;
        }
      }

      void page;

      set({
        doc,
        selection: focusId && doc.nodes[focusId] ? [focusId] : [],
        viewport,
        expanded,
        past: [],
        future: [],
        loading: false,
        libraryFileId: null,
        status: `Imported “${doc.name}” · ${Object.keys(doc.nodes).length.toLocaleString()} nodes · ${doc.pages.length} pages`,
      });
    } catch (err) {
      console.error(err);
      set({
        loading: false,
        status: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  pasteDesignHtml: async (html) => {
    if (!isFigmaClipboardHtml(html)) {
      set({ status: "Clipboard is not a recognized design payload" });
      return;
    }
    set({ loading: true, status: "Pasting clipboard…" });
    try {
      const { doc } = get();
      let schemaBytes: Uint8Array | undefined;
      if (doc.figmaSchemaBase64) {
        const bin = atob(doc.figmaSchemaBase64);
        schemaBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) schemaBytes[i] = bin.charCodeAt(i);
      }

      const payload = decodeFigmaClipboard(html, schemaBytes);
      const synthetic = {
        header: { prelude: "fig-kiwi", version: 0 },
        meta: {
          file_name: doc.name,
          client_meta: {
            background_color: doc.meta.backgroundColor,
          },
        },
        message: payload.message,
        schemaBytes: payload.schemaBytes ?? schemaBytes ?? new Uint8Array(),
        compiledSchema: null,
        images: new Map(),
      };

      const pastedDoc = decodedFigToDocument(synthetic as never);

      get().pushHistory();
      const current = get().doc;
      const pageId = current.currentPageId;
      if (!pageId) throw new Error("No active page");

      const mergedNodes = { ...current.nodes, ...pastedDoc.nodes };
      const pastedPage =
        pastedDoc.pages.find((p) => !p.internal) ?? pastedDoc.pages[0];
      const newChildIds = pastedPage?.children ?? [];

      const pages = current.pages.map((p) =>
        p.id === pageId
          ? { ...p, children: [...p.children, ...newChildIds] }
          : p
      );

      for (const id of newChildIds) {
        if (mergedNodes[id]) {
          mergedNodes[id] = {
            ...mergedNodes[id]!,
            parentId: pageId,
          };
        }
      }

      const next: AlteronDocument = {
        ...current,
        nodes: mergedNodes,
        pages,
        figmaSchemaBase64: payload.schemaBytes
          ? btoa(String.fromCharCode(...payload.schemaBytes))
          : current.figmaSchemaBase64,
      };
      computeAbsoluteTransforms(next, pageId);

      set({
        doc: next,
        selection: newChildIds,
        loading: false,
        status: `Pasted ${newChildIds.length} root node(s)`,
      });
    } catch (err) {
      console.error(err);
      set({
        loading: false,
        status: `Paste failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  loadDocument: (doc) => {
    if (doc.currentPageId) {
      computeAbsoluteTransforms(doc, doc.currentPageId);
    }
    set({
      doc,
      selection: [],
      viewport: defaultViewport(doc),
      expanded: topExpanded(doc),
      past: [],
      future: [],
      loading: false,
      status: `Loaded “${doc.name}” · ${Object.keys(doc.nodes).length.toLocaleString()} nodes`,
    });
  },

  selectAtPoint: (worldX, worldY, additive) => {
    const { doc, selection, tool } = get();
    if (
      tool === "frame" ||
      tool === "rectangle" ||
      tool === "ellipse" ||
      tool === "text"
    ) {
      const type =
        tool === "frame"
          ? "FRAME"
          : tool === "rectangle"
            ? "RECTANGLE"
            : tool === "ellipse"
              ? "ELLIPSE"
              : "TEXT";
      get().createNodeAt(type, worldX, worldY);
      get().setTool("move");
      return;
    }
    const id = hitTest(doc, worldX, worldY);
    if (!id) {
      if (!additive) set({ selection: [] });
      return;
    }
    if (additive) {
      if (selection.includes(id)) {
        set({ selection: selection.filter((s) => s !== id) });
      } else {
        set({ selection: [...selection, id] });
      }
    } else {
      set({ selection: [id] });
    }
    get().persistSession();
  },

  createNodeAt: (type, worldX, worldY) => {
    const { doc } = get();
    const pageId = doc.currentPageId;
    if (!pageId) return;
    get().pushHistory();
    const id = `local:${++localIdCounter}`;
    const size =
      type === "TEXT"
        ? { width: 200, height: 24 }
        : type === "FRAME"
          ? { width: 400, height: 300 }
          : { width: 100, height: 100 };

    const node: SceneNode = {
      id,
      type,
      name:
        type === "FRAME"
          ? "Frame"
          : type === "RECTANGLE"
            ? "Rectangle"
            : type === "ELLIPSE"
              ? "Ellipse"
              : "Text",
      parentId: pageId,
      children: [],
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "PASS_THROUGH",
      transform: { ...identityMat(), m02: worldX, m12: worldY },
      size,
      fills:
        type === "FRAME"
          ? [
              {
                type: "SOLID",
                color: { r: 1, g: 1, b: 1, a: 1 },
                opacity: 1,
                visible: true,
                blendMode: "NORMAL",
              },
            ]
          : type === "TEXT"
            ? [
                {
                  type: "SOLID",
                  color: { r: 1, g: 1, b: 1, a: 1 },
                  opacity: 1,
                  visible: true,
                  blendMode: "NORMAL",
                },
              ]
            : [
                {
                  type: "SOLID",
                  color: { r: 0.85, g: 0.85, b: 0.9, a: 1 },
                  opacity: 1,
                  visible: true,
                  blendMode: "NORMAL",
                },
              ],
      strokes: [],
      strokeWeight: 0,
      strokeAlign: "INSIDE",
      effects: [],
      ...(type === "TEXT"
        ? {
            type: "TEXT" as const,
            characters: "Text",
            textStyle: {
              fontFamily: "Inter",
              fontStyle: "Regular",
              fontSize: 16,
            },
          }
        : {}),
    } as SceneNode;

    const pages = doc.pages.map((p) =>
      p.id === pageId ? { ...p, children: [...p.children, id] } : p
    );
    const next: AlteronDocument = {
      ...doc,
      nodes: { ...doc.nodes, [id]: node },
      pages,
    };
    computeAbsoluteTransforms(next, pageId);
    set({
      doc: next,
      selection: [id],
      status: `Created ${node.name}`,
    });
  },

  patchSelected: (patch) => {
    const { doc, selection } = get();
    if (!selection.length) return;
    get().pushHistory();
    let next = doc;
    for (const id of selection) {
      next = updateNode(next, id, patch);
    }
    if (next.currentPageId) {
      computeAbsoluteTransforms(next, next.currentPageId);
    }
    set({ doc: next });
  },

  moveSelected: (dx, dy) => {
    const { doc, selection } = get();
    if (!selection.length) return;
    get().pushHistory();
    let next = doc;
    for (const id of selection) {
      const node = next.nodes[id];
      if (!node) continue;
      next = updateNode(next, id, {
        transform: {
          ...node.transform,
          m02: node.transform.m02 + dx,
          m12: node.transform.m12 + dy,
        },
      });
    }
    if (next.currentPageId) {
      computeAbsoluteTransforms(next, next.currentPageId);
    }
    set({ doc: next });
  },

  undo: () => {
    const { past, doc, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1]!;
    set({
      past: past.slice(0, -1),
      future: [{ doc: cloneDoc(doc) }, ...future].slice(0, 50),
      doc: prev.doc,
      selection: [],
    });
  },

  redo: () => {
    const { past, doc, future } = get();
    if (!future.length) return;
    const nxt = future[0]!;
    set({
      future: future.slice(1),
      past: [...past, { doc: cloneDoc(doc) }],
      doc: nxt.doc,
      selection: [],
    });
  },

  toggleVisibility: (ids) => {
    const { selection } = get();
    const target = ids?.length ? ids[0]! : selection[0];
    if (!target) return;
    get().applyMenuAction(target, "toggle-visibility");
  },

  deleteSelection: (ids) => {
    const { selection } = get();
    const target = ids?.[0] ?? selection[0];
    if (!target) return;
    get().applyMenuAction(target, "delete");
  },

  duplicateSelection: (ids) => {
    const { selection } = get();
    const target = ids?.[0] ?? selection[0];
    if (!target) return;
    get().applyMenuAction(target, "duplicate");
  },

  bringToFront: (ids) => {
    const { selection } = get();
    const target = ids?.[0] ?? selection[0];
    if (!target) return;
    get().applyMenuAction(target, "bring-to-front");
  },

  sendToBack: (ids) => {
    const { selection } = get();
    const target = ids?.[0] ?? selection[0];
    if (!target) return;
    get().applyMenuAction(target, "send-to-back");
  },

  applyMenuAction: (targetId, action: ContextMenuActionId) => {
    const { doc, selection } = get();
    if (!doc.nodes[targetId]) return;
    get().pushHistory();
    const result = applyContextMenuAction(
      doc,
      selection,
      targetId,
      action,
      () => `local:${++localIdCounter}`
    );
    set({
      doc: result.doc,
      selection: result.selection,
      status: result.status || get().status,
    });
    get().persistSession();
  },
}));

export type { AlteronDocument };

"use client";

import { create } from "zustand";
import {
  addVariableMode,
  alignNodes,
  applyBooleanOperation,
  applyColorVariableAsFill,
  applyFillStyle,
  computeAbsoluteTransforms,
  createColorVariable,
  createComment,
  createComponentFromNode,
  createEmptyDocument,
  createFillStyle,
  createInstanceOf,
  createShapeInDocument,
  createVectorFromPoints,
  deleteComment,
  deleteVectorPoint,
  finalizeLayout,
  hitTest,
  insertVectorPoint,
  moveVectorPoint,
  placeImageAsset,
  resizeNodeByHandle,
  resolveComment,
  rotateNode,
  setActiveMode,
  setAutoLayout,
  setVectorClosed,
  swapInstanceComponent,
  updateCommentMessage,
  applyNodePatch,
  updateNode,
  updateNodeRect,
  type AlignMode,
  type AlteronDocument,
  type AutoLayout,
  type BooleanKind,
  type CreateShapeType,
  type NodeId,
  type ResizeHandle,
  type SceneNode,
  type Vec2,
} from "@alteron/document-model";
import { importFigFile, decodedFigToDocument } from "@alteron/fig-import";
import {
  collectReferencedImageHashes,
  decodeFigmaClipboardAsync,
  isFigmaClipboardHtml,
} from "@alteron/fig-format";
import {
  importFileToLibrary,
  openLibraryFile,
  saveLibraryDocument,
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
  | "image"
  | "comment";

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface HistoryEntry {
  doc: AlteronDocument;
}

/** Pending paste that would drop image fills (or other non-clipboard assets). */
export type PasteWarning = {
  html: string;
  /** IMAGE fills that reference hashes with no bytes in the clipboard */
  missingImages: number;
  /** Image assets we could extract from the clipboard */
  availableImages: number;
  /** Rough node count in the clipboard payload */
  nodeCount: number;
};

export type PasteDesignOptions = {
  /**
   * Skip the partial-paste confirmation modal and apply structure even when
   * image bytes are missing from the clipboard.
   */
  acceptPartial?: boolean;
};

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
  /**
   * When set, clipboard paste would drop images (or similar assets).
   * UI shows a modal: paste structure anyway vs import .fig.
   */
  pasteWarning: PasteWarning | null;
  /** Active comment pin selection (comment tool / panel) */
  selectedCommentId: string | null;

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
  /** Debounced session persist to SQLite (viewport, selection — not content) */
  persistSession: () => void;
  /** Debounced full document auto-save to library (paste, edits, rename) */
  persistDocument: () => void;
  /** Paste design clipboard HTML (format interop; marker not user-facing) */
  pasteDesignHtml: (
    html: string,
    options?: PasteDesignOptions
  ) => Promise<void>;
  /** User chose “Paste structure only” on the warning modal */
  confirmPartialPaste: () => Promise<void>;
  /** Dismiss paste warning without pasting */
  cancelPasteWarning: () => void;
  newDocument: () => void;
  focusNode: (nodeId: NodeId, canvasW?: number, canvasH?: number) => void;

  selectAtPoint: (worldX: number, worldY: number, additive?: boolean) => void;
  patchSelected: (patch: Partial<SceneNode>) => void;
  /** Rename any node by id (layers panel / properties). */
  renameNode: (id: NodeId, name: string) => void;
  moveSelected: (dx: number, dy: number) => void;
  createNodeAt: (
    type: "FRAME" | "RECTANGLE" | "ELLIPSE" | "TEXT",
    worldX: number,
    worldY: number
  ) => void;
  /** Drag-create: start shape at point with minimal size */
  beginCreateShape: (
    type: CreateShapeType,
    worldX: number,
    worldY: number
  ) => NodeId | null;
  updateCreateShape: (
    id: NodeId,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) => void;
  resizeSelected: (
    handle: ResizeHandle,
    worldX: number,
    worldY: number,
    opts?: { keepAspect?: boolean }
  ) => void;
  rotateSelected: (degrees: number) => void;
  alignSelection: (mode: AlignMode) => void;
  setSelectionAutoLayout: (patch: Partial<AutoLayout>) => void;
  booleanSelection: (op: BooleanKind) => void;
  createComponentFromSelection: () => void;
  instantiateSelectedComponent: () => void;
  swapSelectedInstance: (componentId: NodeId) => void;
  createStyleFromSelection: (name: string) => void;
  applyStyleToSelection: (styleId: string) => void;
  createVariableFromSelection: (name: string) => void;
  applyVariableToSelection: (variableId: string) => void;
  placeImage: (
    dataUrl: string,
    mimeType: string,
    worldX: number,
    worldY: number,
    width: number,
    height: number,
    name?: string
  ) => void;
  commitPenPath: (points: Vec2[], closed?: boolean) => void;
  addCommentAt: (x: number, y: number, message: string) => void;
  resolveSelectedComment: (commentId: string, resolved?: boolean) => void;
  updateSelectedComment: (commentId: string, message: string) => void;
  deleteSelectedComment: (commentId: string) => void;
  setVariableMode: (collectionId: string, modeId: string) => void;
  addModeToCollection: (collectionId: string, name: string) => void;
  moveVectorPointAt: (
    id: NodeId,
    index: number,
    local: Vec2,
    closed?: boolean
  ) => void;
  insertVectorPointAt: (
    id: NodeId,
    afterIndex: number,
    local: Vec2,
    closed?: boolean
  ) => void;
  deleteVectorPointAt: (id: NodeId, index: number, closed?: boolean) => void;
  setVectorPathClosed: (id: NodeId, closed: boolean) => void;
  setSelectedCommentId: (id: string | null) => void;
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
let docSaveTimer: ReturnType<typeof setTimeout> | null = null;
/** Last kiwi schema seen this session — used when pasting into blank files. */
let sessionSchemaCache: Uint8Array | undefined;

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
  pasteWarning: null,
  selectedCommentId: null,

  setTool: (tool) => set({ tool }),
  setSelectedCommentId: (id) => set({ selectedCommentId: id }),
  setViewport: (v) => {
    set((s) => {
      const next = { ...s.viewport, ...v };
      if (typeof next.zoom === "number") {
        // Keep zoom inside shared MIN/MAX (see lib/viewport.ts)
        const z = next.zoom;
        next.zoom = Math.min(256, Math.max(0.0001, z));
      }
      return { viewport: next };
    });
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

  persistDocument: () => {
    const { libraryFileId, doc } = get();
    if (!libraryFileId) return;
    if (docSaveTimer) clearTimeout(docSaveTimer);
    docSaveTimer = setTimeout(() => {
      const { libraryFileId: id, doc: snapshot } = get();
      if (!id) return;
      void saveLibraryDocument(id, snapshot)
        .then((r) => {
          if (r.ok) {
            set({
              status: `Saved · ${Object.keys(snapshot.nodes).length.toLocaleString()} nodes`,
            });
          }
        })
        .catch((err) => {
          console.error("[sigmadesign] auto-save failed", err);
          set({
            status: `Auto-save failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
        });
    }, 600);
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

      if (doc.figmaSchemaBase64) {
        try {
          const bin = atob(doc.figmaSchemaBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          sessionSchemaCache = bytes;
        } catch {
          /* ignore corrupt schema cache */
        }
      }

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
          const parentNode: SceneNode | undefined = doc.nodes[p];
          if (!parentNode) break;
          if (parentNode.type === "PAGE") {
            doc.currentPageId = p;
            break;
          }
          p = parentNode.parentId;
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

  pasteDesignHtml: async (html, options) => {
    if (!isFigmaClipboardHtml(html)) {
      set({
        status:
          "Clipboard is not a design payload — copy layers from a design tool first",
      });
      return;
    }
    set({ loading: true, status: "Reading clipboard…", pasteWarning: null });
    try {
      const { doc } = get();
      let schemaBytes: Uint8Array | undefined;
      if (doc.figmaSchemaBase64) {
        const bin = atob(doc.figmaSchemaBase64);
        schemaBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) schemaBytes[i] = bin.charCodeAt(i);
      } else if (sessionSchemaCache) {
        // Schema from a previous import in this browser session (helps blank files)
        schemaBytes = sessionSchemaCache;
      }

      // Async decode supports full .fig ZIP clipboards + image-blob extraction
      const payload = await decodeFigmaClipboardAsync(html, schemaBytes);
      if (payload.schemaBytes?.length) {
        sessionSchemaCache = payload.schemaBytes;
      }

      const images = payload.images ?? new Map<string, Uint8Array>();
      const referenced = collectReferencedImageHashes(payload.message);
      const availableImages = images.size;
      // Hashes referenced by IMAGE fills that have no bytes in this payload
      const missingImages = [...referenced].filter((h) => !images.has(h)).length;
      const nodeCount = payload.message.nodeChanges?.length ?? 0;

      // Incomplete clipboard: ask before applying structure-only paste
      if (missingImages > 0 && !options?.acceptPartial) {
        set({
          loading: false,
          pasteWarning: {
            html,
            missingImages,
            availableImages,
            nodeCount,
          },
          status: `Clipboard has ${missingImages} image(s) that cannot be pasted`,
        });
        return;
      }

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
        images,
      };

      set({ status: "Pasting clipboard…" });
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

      // Merge assets (images) + components from paste into the open document
      const assets = { ...current.assets, ...pastedDoc.assets };
      const components = { ...current.components, ...pastedDoc.components };

      // Safe base64 for large schemas (spread into btoa blows the call stack)
      let figmaSchemaBase64 = current.figmaSchemaBase64;
      if (payload.schemaBytes?.length) {
        const sb = payload.schemaBytes;
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < sb.length; i += chunk) {
          binary += String.fromCharCode(...sb.subarray(i, i + chunk));
        }
        figmaSchemaBase64 = btoa(binary);
      }

      const next: AlteronDocument = {
        ...current,
        nodes: mergedNodes,
        pages,
        assets,
        components,
        figmaSchemaBase64,
      };
      computeAbsoluteTransforms(next, pageId);

      const imageCount = Object.keys(pastedDoc.assets).filter(
        (h) => pastedDoc.assets[h]?.dataUrl
      ).length;
      const stillMissing = [...referenced].filter((h) => !assets[h]?.dataUrl)
        .length;
      const imgNote =
        imageCount > 0
          ? ` · ${imageCount} image(s)`
          : stillMissing > 0
            ? ` · ${stillMissing} image fill(s) without bytes`
            : "";

      set({
        doc: next,
        selection: newChildIds,
        loading: false,
        pasteWarning: null,
        status: `Pasted ${newChildIds.length} root node(s)${imgNote} · saving…`,
      });
      // Auto-save document content (session-only persist would lose paste on reload)
      get().persistDocument();
      get().persistSession();
    } catch (err) {
      console.error(err);
      set({
        loading: false,
        pasteWarning: null,
        status: `Paste failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  confirmPartialPaste: async () => {
    const warning = get().pasteWarning;
    if (!warning) return;
    set({ pasteWarning: null });
    await get().pasteDesignHtml(warning.html, { acceptPartial: true });
  },

  cancelPasteWarning: () => {
    set({
      pasteWarning: null,
      status: "Paste cancelled",
    });
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
    get().pushHistory();
    const w =
      type === "TEXT" ? 200 : type === "FRAME" ? 400 : 100;
    const h =
      type === "TEXT" ? 24 : type === "FRAME" ? 300 : 100;
    const { doc, id } = createShapeInDocument(
      get().doc,
      type,
      worldX,
      worldY,
      w,
      h
    );
    if (!id) return;
    set({
      doc,
      selection: [id],
      status: `Created ${doc.nodes[id]?.name ?? type}`,
    });
    get().persistDocument();
  },

  beginCreateShape: (type, worldX, worldY) => {
    get().pushHistory();
    const { doc, id } = createShapeInDocument(
      get().doc,
      type,
      worldX,
      worldY,
      type === "TEXT" ? 200 : 1,
      type === "TEXT" ? 24 : 1
    );
    if (!id) return null;
    set({
      doc,
      selection: [id],
      status: `Drawing ${doc.nodes[id]?.name ?? type}…`,
    });
    return id;
  },

  updateCreateShape: (id, x0, y0, x1, y1) => {
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.max(1, Math.abs(x1 - x0));
    const h = Math.max(1, Math.abs(y1 - y0));
    const doc = updateNodeRect(get().doc, id, x, y, w, h);
    set({ doc });
  },

  resizeSelected: (handle, worldX, worldY, opts) => {
    const { selection, doc } = get();
    const id = selection[0];
    if (!id) return;
    const next = resizeNodeByHandle(doc, id, handle, worldX, worldY, {
      keepAspect: opts?.keepAspect,
    });
    set({ doc: next });
  },

  rotateSelected: (degrees) => {
    const { selection, doc } = get();
    const id = selection[0];
    if (!id) return;
    set({ doc: rotateNode(doc, id, degrees) });
    get().persistDocument();
  },

  alignSelection: (mode) => {
    const { selection, doc } = get();
    if (selection.length < 2) return;
    get().pushHistory();
    set({
      doc: alignNodes(doc, selection, mode),
      status: `Aligned (${mode})`,
    });
    get().persistDocument();
  },

  setSelectionAutoLayout: (patch) => {
    const { selection, doc } = get();
    const id = selection[0];
    if (!id) return;
    get().pushHistory();
    set({
      doc: setAutoLayout(doc, id, patch),
      status: "Auto layout updated",
    });
    get().persistDocument();
  },

  booleanSelection: (op) => {
    const { selection, doc } = get();
    if (selection.length < 2) return;
    get().pushHistory();
    const r = applyBooleanOperation(doc, selection, op);
    if (!r.id) return;
    set({
      doc: r.doc,
      selection: [r.id],
      status: `Boolean ${op}`,
    });
    get().persistDocument();
  },

  createComponentFromSelection: () => {
    const { selection, doc } = get();
    const id = selection[0];
    if (!id) return;
    get().pushHistory();
    const r = createComponentFromNode(doc, id);
    set({
      doc: r.doc,
      selection: [r.componentId],
      status: "Created component",
    });
    get().persistDocument();
  },

  instantiateSelectedComponent: () => {
    const { selection, doc } = get();
    const id = selection[0];
    if (!id) return;
    const node = doc.nodes[id];
    const componentId =
      node?.type === "COMPONENT"
        ? id
        : node?.type === "INSTANCE" && "componentId" in node
          ? (node.componentId as string)
          : id;
    get().pushHistory();
    const r = createInstanceOf(doc, componentId);
    if (!r.instanceId) return;
    set({
      doc: r.doc,
      selection: [r.instanceId],
      status: "Created instance",
    });
    get().persistDocument();
  },

  swapSelectedInstance: (componentId) => {
    const { selection, doc } = get();
    const id = selection[0];
    if (!id) return;
    get().pushHistory();
    set({
      doc: swapInstanceComponent(doc, id, componentId),
      status: "Swapped instance",
    });
    get().persistDocument();
  },

  createStyleFromSelection: (name) => {
    const { selection, doc } = get();
    const id = selection[0];
    const node = id ? doc.nodes[id] : null;
    if (!node) return;
    get().pushHistory();
    const r = createFillStyle(doc, name || "Style", node.fills);
    let next = r.doc;
    next = applyFillStyle(next, id!, r.styleId);
    set({ doc: next, status: `Style “${name}” created` });
    get().persistDocument();
  },

  applyStyleToSelection: (styleId) => {
    const { selection, doc } = get();
    if (!selection.length) return;
    get().pushHistory();
    let next = doc;
    for (const id of selection) next = applyFillStyle(next, id, styleId);
    set({ doc: next, status: "Style applied" });
    get().persistDocument();
  },

  createVariableFromSelection: (name) => {
    const { selection, doc } = get();
    const id = selection[0];
    const node = id ? doc.nodes[id] : null;
    if (!node) return;
    const solid = node.fills.find((f) => f.type === "SOLID" && "color" in f) as
      | { color: { r: number; g: number; b: number; a: number } }
      | undefined;
    if (!solid) {
      set({ status: "Select a layer with a solid fill first" });
      return;
    }
    get().pushHistory();
    const r = createColorVariable(doc, name || "Color", solid.color);
    set({
      doc: r.doc,
      status: `Variable “${name}” created`,
    });
    get().persistDocument();
  },

  applyVariableToSelection: (variableId) => {
    const { selection, doc } = get();
    if (!selection.length) return;
    get().pushHistory();
    let next = doc;
    for (const id of selection)
      next = applyColorVariableAsFill(next, id, variableId);
    set({ doc: next, status: "Variable applied" });
    get().persistDocument();
  },

  placeImage: (dataUrl, mimeType, worldX, worldY, width, height, name) => {
    get().pushHistory();
    const r = placeImageAsset(
      get().doc,
      dataUrl,
      mimeType,
      worldX,
      worldY,
      width,
      height,
      { name }
    );
    set({
      doc: r.doc,
      selection: r.id ? [r.id] : [],
      status: "Image placed",
      tool: "move",
    });
    get().persistDocument();
  },

  commitPenPath: (points, closed) => {
    if (points.length < 2) return;
    get().pushHistory();
    const r = createVectorFromPoints(get().doc, points, { closed });
    if (!r.id) return;
    set({
      doc: r.doc,
      selection: [r.id],
      status: closed ? "Closed vector" : "Vector path",
      tool: "move",
    });
    get().persistDocument();
  },

  addCommentAt: (x, y, message) => {
    get().pushHistory();
    const r = createComment(get().doc, x, y, message, {
      pageId: get().doc.currentPageId ?? undefined,
    });
    set({
      doc: r.doc,
      selectedCommentId: r.commentId,
      status: "Comment added",
      tool: "move",
    });
    get().persistDocument();
  },

  resolveSelectedComment: (commentId, resolved = true) => {
    get().pushHistory();
    set({
      doc: resolveComment(get().doc, commentId, resolved),
      status: resolved ? "Comment resolved" : "Comment reopened",
    });
    get().persistDocument();
  },

  updateSelectedComment: (commentId, message) => {
    get().pushHistory();
    set({
      doc: updateCommentMessage(get().doc, commentId, message),
      status: "Comment updated",
    });
    get().persistDocument();
  },

  deleteSelectedComment: (commentId) => {
    get().pushHistory();
    set({
      doc: deleteComment(get().doc, commentId),
      selectedCommentId: null,
      status: "Comment deleted",
    });
    get().persistDocument();
  },

  setVariableMode: (collectionId, modeId) => {
    get().pushHistory();
    set({
      doc: setActiveMode(get().doc, collectionId, modeId),
      status: "Variable mode switched",
    });
    get().persistDocument();
  },

  addModeToCollection: (collectionId, name) => {
    get().pushHistory();
    const r = addVariableMode(get().doc, collectionId, name);
    set({
      doc: r.doc,
      status: r.modeId ? `Mode “${name}” added` : "Could not add mode",
    });
    get().persistDocument();
  },

  moveVectorPointAt: (id, index, local, closed) => {
    set({ doc: moveVectorPoint(get().doc, id, index, local, closed) });
  },

  insertVectorPointAt: (id, afterIndex, local, closed) => {
    get().pushHistory();
    set({
      doc: insertVectorPoint(get().doc, id, afterIndex, local, closed),
      status: "Point inserted",
    });
    get().persistDocument();
  },

  deleteVectorPointAt: (id, index, closed) => {
    get().pushHistory();
    set({
      doc: deleteVectorPoint(get().doc, id, index, closed),
      status: "Point deleted",
    });
    get().persistDocument();
  },

  setVectorPathClosed: (id, closed) => {
    get().pushHistory();
    set({
      doc: setVectorClosed(get().doc, id, closed),
      status: closed ? "Path closed" : "Path opened",
    });
    get().persistDocument();
  },

  patchSelected: (patch) => {
    const { doc, selection } = get();
    if (!selection.length) return;
    get().pushHistory();
    let next = doc;
    // Size patches use resizeNodeApplyingConstraints so Design-panel W/H
    // reflows MAX/CENTER/STRETCH/SCALE children (same as canvas handles).
    for (const id of selection) {
      next = applyNodePatch(next, id, patch);
    }
    set({ doc: next });
    get().persistDocument();
  },

  renameNode: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { doc } = get();
    if (!doc.nodes[id] || doc.nodes[id]!.name === trimmed) return;
    get().pushHistory();
    let next = updateNode(doc, id, { name: trimmed });
    if (next.currentPageId) {
      computeAbsoluteTransforms(next, next.currentPageId);
    }
    set({ doc: next });
    get().persistDocument();
    get().persistSession();
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
    get().persistDocument();
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
    get().persistDocument();
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
    get().persistDocument();
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
    get().persistDocument();
    get().persistSession();
  },
}));

export type { AlteronDocument };

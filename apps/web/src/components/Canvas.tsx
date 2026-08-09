"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeAbsoluteTransforms } from "@alteron/document-model";
import { useDocumentStore } from "@/store/document-store";
import {
  clearRenderCaches,
  hitTestFast,
  renderScene,
  type Viewport,
} from "@/lib/render-engine";
import {
  ContextMenu,
  type ContextMenuState,
} from "@/components/ContextMenu";
import type { ContextMenuActionId } from "@/lib/context-menu-actions";
import { loadDesignFontsForDocument } from "@/lib/design-fonts";

/**
 * High-performance canvas: viewport lives in refs during gestures so pan/zoom
 * never re-renders React; drawing is rAF-scheduled with aggressive culling.
 */
export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 0.25 });
  const rafRef = useRef(0);
  const needsDraw = useRef(true);
  const lastStats = useRef({ drawn: 0, ms: 0 });

  // Subscribe narrowly — avoid re-render on every viewport tick
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const tool = useDocumentStore((s) => s.tool);
  const storeViewport = useDocumentStore((s) => s.viewport);
  const setViewportStore = useDocumentStore((s) => s.setViewport);
  const setSelection = useDocumentStore((s) => s.setSelection);
  const pasteDesignHtml = useDocumentStore((s) => s.pasteDesignHtml);
  const setStatus = useDocumentStore((s) => s.setStatus);
  const setTool = useDocumentStore((s) => s.setTool);
  const applyMenuAction = useDocumentStore((s) => s.applyMenuAction);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(
    null
  );

  // Keep ref in sync when store viewport changes externally (load file, zoom buttons)
  useEffect(() => {
    viewportRef.current = { ...storeViewport };
    needsDraw.current = true;
  }, [storeViewport]);

  // Clear path cache when document identity changes
  const docName = doc.name;
  const nodeCount = Object.keys(doc.nodes).length;
  useEffect(() => {
    clearRenderCaches();
    needsDraw.current = true;
  }, [docName, nodeCount, doc.currentPageId]);

  const scheduleDraw = useCallback(() => {
    needsDraw.current = true;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(function tick() {
      rafRef.current = 0;
      if (!needsDraw.current) return;
      needsDraw.current = false;

      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      // Higher DPR when zoomed in keeps logos/icons sharp on retina
      const zoom = viewportRef.current.zoom;
      const dprCap = zoom >= 0.75 ? 3 : zoom >= 0.35 ? 2.5 : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;

      const bw = Math.floor(w * dpr);
      const bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ctx) {
        (
          ctx as CanvasRenderingContext2D & { imageSmoothingQuality: string }
        ).imageSmoothingQuality = "high";
      }
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(0, 0, w, h);

      const state = useDocumentStore.getState();
      const stats = renderScene(ctx, state.doc, viewportRef.current, w, h, {
        selection: state.selection,
        onImageLoad: () => {
          needsDraw.current = true;
          scheduleDraw();
        },
      });
      lastStats.current = { drawn: stats.drawn, ms: stats.ms };
    });
  }, []);

  useEffect(() => {
    scheduleDraw();
  }, [doc, selection, scheduleDraw]);

  // Load every font family/weight used in the design document, then re-draw
  useEffect(() => {
    let cancelled = false;
    void loadDesignFontsForDocument(doc).then(() => {
      if (cancelled) return;
      needsDraw.current = true;
      scheduleDraw();
    });
    return () => {
      cancelled = true;
    };
  }, [doc, docName, nodeCount, scheduleDraw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleDraw());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // Throttle store viewport sync (for zoom % display) without blocking draws
  const syncTimer = useRef(0);
  const flushViewportToStore = useCallback(() => {
    const v = viewportRef.current;
    setViewportStore({ x: v.x, y: v.y, zoom: v.zoom });
  }, [setViewportStore]);

  const queueViewportSync = useCallback(() => {
    if (syncTimer.current) return;
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = 0;
      flushViewportToStore();
    }, 80);
  }, [flushViewportToStore]);

  // Wheel: pan/zoom via refs only
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const vp = viewportRef.current;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey || e.altKey) {
        const delta =
          e.deltaMode === 1
            ? e.deltaY * 16
            : e.deltaMode === 2
              ? e.deltaY * 32
              : e.deltaY;
        const factor = Math.exp(-delta * 0.01);
        const newZoom = Math.min(8, Math.max(0.02, vp.zoom * factor));
        const wx = (sx - vp.x) / vp.zoom;
        const wy = (sy - vp.y) / vp.zoom;
        viewportRef.current = {
          zoom: newZoom,
          x: sx - wx * newZoom,
          y: sy - wy * newZoom,
        };
      } else {
        viewportRef.current = {
          ...vp,
          x: vp.x - e.deltaX,
          y: vp.y - e.deltaY,
        };
      }
      scheduleDraw();
      queueViewportSync();
    };

    const blockGesture = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", blockGesture, {
      passive: false,
    } as AddEventListenerOptions);
    el.addEventListener("gesturechange", blockGesture, {
      passive: false,
    } as AddEventListenerOptions);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", blockGesture);
      el.removeEventListener("gesturechange", blockGesture);
    };
  }, [scheduleDraw, queueViewportSync]);

  const dragRef = useRef<{
    mode: "pan" | "move" | null;
    lastX: number;
    lastY: number;
    space: boolean;
  }>({ mode: null, lastX: 0, lastY: 0, space: false });

  // Keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const store = useDocumentStore.getState();
      if (e.code === "Space") {
        dragRef.current.space = true;
        e.preventDefault();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        store.redo();
      }
      if (e.key === "v" || e.key === "V") store.setTool("move");
      if (e.key === "h" || e.key === "H") store.setTool("hand");
      if (e.key === "f" || e.key === "F") store.setTool("frame");
      if (e.key === "r" || e.key === "R") store.setTool("rectangle");
      if (e.key === "t" || e.key === "T") store.setTool("text");
      if (e.key === "Escape") {
        store.setSelection([]);
        setContextMenu(null);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.deleteSelection();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        store.duplicateSelection();
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        store.moveSelected(-step, 0);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        store.moveSelected(step, 0);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        store.moveSelected(0, -step);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        store.moveSelected(0, step);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") dragRef.current.space = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const html = e.clipboardData?.getData("text/html");
      // Format marker is an interop implementation detail — never shown in UI
      if (html && html.includes("<!--(figma)")) {
        e.preventDefault();
        void pasteDesignHtml(html);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pasteDesignHtml]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const vp = viewportRef.current;
    return {
      x: (clientX - rect.left - vp.x) / vp.zoom,
      y: (clientY - rect.top - vp.y) / vp.zoom,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Secondary / right-click: never create, select, clear, or pushHistory.
    // contextmenu handler owns that path.
    if (e.button === 2 || e.button > 2) {
      return;
    }

    // Middle mouse button: pan only
    const middlePan = e.button === 1;
    const primaryPan =
      e.button === 0 &&
      (tool === "hand" || dragRef.current.space || e.altKey);

    if (middlePan || primaryPan) {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        ...dragRef.current,
        mode: "pan",
        lastX: e.clientX,
        lastY: e.clientY,
      };
      return;
    }

    // Document tools / select / move: primary button only
    if (e.button !== 0) return;

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const world = screenToWorld(e.clientX, e.clientY);
    const store = useDocumentStore.getState();
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
      store.createNodeAt(type, world.x, world.y);
      store.setTool("move");
      return;
    }

    const id = hitTestFast(store.doc, world.x, world.y);
    if (!id) {
      if (!e.shiftKey) setSelection([]);
    } else if (e.shiftKey) {
      const sel = store.selection;
      setSelection(
        sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]
      );
    } else {
      setSelection([id]);
    }

    if (id && tool === "move") {
      dragRef.current = {
        ...dragRef.current,
        mode: "move",
        lastX: e.clientX,
        lastY: e.clientY,
      };
      store.pushHistory();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d.mode === "pan") {
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      const vp = viewportRef.current;
      viewportRef.current = { ...vp, x: vp.x + dx, y: vp.y + dy };
      scheduleDraw();
      queueViewportSync();
    } else if (d.mode === "move") {
      const vp = viewportRef.current;
      const dx = (e.clientX - d.lastX) / vp.zoom;
      const dy = (e.clientY - d.lastY) / vp.zoom;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      // Mutate in place during drag for speed; commit is already in history
      const store = useDocumentStore.getState();
      const nodes = store.doc.nodes;
      for (const id of store.selection) {
        const node = nodes[id];
        if (!node) continue;
        node.transform = {
          ...node.transform,
          m02: node.transform.m02 + dx,
          m12: node.transform.m12 + dy,
        };
      }
      if (store.doc.currentPageId) {
        computeAbsoluteTransforms(store.doc, store.doc.currentPageId);
      }
      // Redraw without React re-render of layers panel
      scheduleDraw();
    }
  };

  const onPointerUp = () => {
    if (dragRef.current.mode === "pan") flushViewportToStore();
    if (dragRef.current.mode === "move") {
      // Notify React of in-place doc mutations from drag
      const d = useDocumentStore.getState().doc;
      useDocumentStore.setState({ doc: { ...d, nodes: d.nodes } });
    }
    dragRef.current.mode = null;
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(fig|sig)$/i.test(file.name)) {
      try {
        const id =
          await useDocumentStore.getState().importToLibraryAndOpen(file);
        window.location.assign(`/file/${id}`);
      } catch {
        /* status already set */
      }
    } else {
      setStatus("Drop a .sig or .fig design file to import into your library");
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const world = screenToWorld(e.clientX, e.clientY);
    const hit = hitTestFast(doc, world.x, world.y);
    if (!hit) {
      setContextMenu(null);
      return;
    }
    if (!selection.includes(hit)) {
      setSelection([hit]);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: hit });
  };

  const onMenuAction = (action: ContextMenuActionId) => {
    if (!contextMenu) return;
    applyMenuAction(contextMenu.targetId, action);
    if (action === "edit-properties") {
      // Properties panel already reflects selection
      setStatus("Edit properties in the Design panel");
    }
  };

  return (
    <div
      ref={containerRef}
      className="design-canvas"
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--canvas-color)",
        touchAction: "none",
        overscrollBehavior: "none",
        cursor:
          tool === "hand" || dragRef.current.space
            ? "grab"
            : tool === "move"
              ? "default"
              : "crosshair",
      }}
      onPointerDown={(e) => {
        // Primary click dismisses menu; secondary is for context menu only
        if (e.button === 0) setContextMenu(null);
        // Skip full pointer pipeline for right-click (button 2) and other non-pan buttons
        if (e.button === 2 || e.button > 2) return;
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {Object.keys(doc.nodes).length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(12,14,20,0.85)",
              border: "1px solid var(--chrome-border)",
              borderRadius: 12,
              padding: "28px 36px",
              maxWidth: 420,
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              Empty canvas
            </div>
            <div style={{ color: "var(--chrome-text-muted)" }}>
              Drag-and-drop a <code>.sig</code> or <code>.fig</code> design
              file, open one from the library, or paste design clipboard
              (Ctrl/Cmd+V).
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onAction={onMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

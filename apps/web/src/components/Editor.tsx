"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { Canvas } from "./Canvas";
import { PasteWarningModal } from "./PasteWarningModal";
import { importFileToLibrary, saveLibraryDocument } from "@/lib/library-api";
import { useDocumentStore } from "@/store/document-store";

type Props = {
  /** Library file id from `/file/[id]` route */
  fileId: string;
};

/**
 * Canvas editor shell for a single library file.
 * Home/library lives at `/` only — this component never swaps to the home UI.
 */
export function Editor({ fileId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loading = useDocumentStore((s) => s.loading);
  const libraryFileId = useDocumentStore((s) => s.libraryFileId);
  const status = useDocumentStore((s) => s.status);
  const pasteWarning = useDocumentStore((s) => s.pasteWarning);
  const selection = useDocumentStore((s) => s.selection);
  const selectedCommentId = useDocumentStore((s) => s.selectedCommentId);
  const designPanelOpen =
    selection.length > 0 || Boolean(selectedCommentId);
  const openFromLibrary = useDocumentStore((s) => s.openFromLibrary);
  const setStatus = useDocumentStore((s) => s.setStatus);
  const focusNode = useDocumentStore((s) => s.focusNode);
  const confirmPartialPaste = useDocumentStore((s) => s.confirmPartialPaste);
  const cancelPasteWarning = useDocumentStore((s) => s.cancelPasteWarning);
  const focusedOnce = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Load file when route id changes
  useEffect(() => {
    if (!fileId) return;
    if (
      libraryFileId === fileId &&
      Object.keys(useDocumentStore.getState().doc.nodes).length > 0
    ) {
      return;
    }
    // Show center loader immediately (before async open) so empty-canvas
    // hint never flashes while the file is still loading.
    useDocumentStore.setState({
      loading: true,
      status: "Opening file…",
    });
    void (async () => {
      try {
        await openFromLibrary(fileId);
      } catch {
        useDocumentStore.setState({ loading: false });
        setStatus(`Could not open file ${fileId}`);
        router.replace("/");
      }
    })();
  }, [fileId, libraryFileId, openFromLibrary, router, setStatus]);

  // Optional ?focus=nodeId after open (parity / deep links)
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || libraryFileId !== fileId) return;
    if (focusedOnce.current === `${fileId}:${focus}`) return;
    if (!useDocumentStore.getState().doc.nodes[focus]) return;
    focusedOnce.current = `${fileId}:${focus}`;
    focusNode(focus);
  }, [searchParams, libraryFileId, fileId, focusNode]);
  // Dev/test hook
  useEffect(() => {
    (
      window as unknown as { __SIGMA_STORE__?: typeof useDocumentStore }
    ).__SIGMA_STORE__ = useDocumentStore;
    return () => {
      delete (window as unknown as { __SIGMA_STORE__?: unknown }).__SIGMA_STORE__;
    };
  }, []);

  // Block browser page zoom outside inputs
  useEffect(() => {
    const blockBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const blockGesture = (e: Event) => e.preventDefault();
    document.addEventListener("wheel", blockBrowserZoom, { passive: false });
    document.addEventListener("gesturestart", blockGesture, {
      passive: false,
    } as AddEventListenerOptions);
    document.addEventListener("gesturechange", blockGesture, {
      passive: false,
    } as AddEventListenerOptions);
    return () => {
      document.removeEventListener("wheel", blockBrowserZoom);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
    };
  }, []);

  // Persist session + document on unload (paste/edits must not be lost)
  useEffect(() => {
    const flush = () => {
      const s = useDocumentStore.getState();
      s.persistSession();
      // Immediate document save (bypass debounce) when leaving the page
      if (s.libraryFileId) {
        void saveLibraryDocument(s.libraryFileId, s.doc).catch(() => {
          /* non-fatal on unload */
        });
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  const onPasteAnyway = useCallback(() => {
    void confirmPartialPaste();
  }, [confirmPartialPaste]);

  const onImportInstead = useCallback(() => {
    cancelPasteWarning();
    // Prefer native file picker so user can drop a full .fig with images
    importInputRef.current?.click();
  }, [cancelPasteWarning]);

  const onImportFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setStatus(`Importing ${file.name}…`);
      try {
        const item = await importFileToLibrary(file);
        router.push(`/file/${item.id}`);
      } catch (e) {
        setStatus(
          `Import failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
    [router, setStatus]
  );

  return (
    <div className="app-shell">
      <a href="#canvas-main" className="skip-link">
        Skip to canvas
      </a>
      {/* Single grid row above workspace so the loading ribbon never steals 1fr */}
      <div className="sigma-chrome-top">
        <TopBar />
        {loading && (
          <div className="sigma-loading-bar" role="status" aria-live="polite">
            <span className="sigma-loading-bar-fill" />
            <span className="sigma-loading-label">
              {status || "Opening file…"}
            </span>
          </div>
        )}
      </div>
      <div
        className={
          designPanelOpen ? "workspace" : "workspace workspace-props-collapsed"
        }
      >
        <ToolRail />
        <LayersPanel />
        <main id="canvas-main" className="canvas-main" tabIndex={-1}>
          <Canvas />
        </main>
        {designPanelOpen ? <PropertiesPanel /> : null}
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".fig,.sig,application/zip,application/octet-stream"
        className="sigma-visually-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void onImportFile(f);
        }}
      />

      {pasteWarning && (
        <PasteWarningModal
          warning={pasteWarning}
          onPasteAnyway={onPasteAnyway}
          onImportInstead={onImportInstead}
          onCancel={cancelPasteWarning}
        />
      )}
    </div>
  );
}

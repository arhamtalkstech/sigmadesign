"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useDocumentStore } from "@/store/document-store";
import { importFileToLibrary } from "@/lib/library-api";
import { ChromeIcons, Icon } from "@/lib/chrome-icons";
import { clampZoom, formatZoomPercent } from "@/lib/viewport";
import { exportDocumentRegionToPng } from "@/lib/export-png";

export function TopBar() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const doc = useDocumentStore((s) => s.doc);
  const status = useDocumentStore((s) => s.status);
  const loading = useDocumentStore((s) => s.loading);
  const viewport = useDocumentStore((s) => s.viewport);
  const libraryFileId = useDocumentStore((s) => s.libraryFileId);
  const openFromLibrary = useDocumentStore((s) => s.openFromLibrary);
  const newDocument = useDocumentStore((s) => s.newDocument);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const setViewport = useDocumentStore((s) => s.setViewport);
  const persistSession = useDocumentStore((s) => s.persistSession);
  const setStatus = useDocumentStore((s) => s.setStatus);

  const goHome = () => {
    persistSession();
    router.push("/");
  };

  const onImport = async (file: File) => {
    setStatus(`Importing ${file.name}…`);
    try {
      const item = await importFileToLibrary(file);
      router.push(`/file/${item.id}`);
    } catch (e) {
      setStatus(
        `Import failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  return (
    <header className="sigma-topbar" role="banner">
      <button
        type="button"
        onClick={goHome}
        title="Back to library"
        className="sigma-topbar-brand"
      >
        <span className="sigma-logo sigma-logo-sm" aria-hidden />
        <span className="sigma-topbar-product">SigmaDesign</span>
      </button>

      <nav className="sigma-topbar-nav" aria-label="File">
        <button type="button" className="sigma-topbar-btn" onClick={goHome}>
          <Icon icon={ChromeIcons.Library} size={14} />
          Library
        </button>
        <button
          type="button"
          className="sigma-topbar-btn primary"
          onClick={() => fileRef.current?.click()}
        >
          <Icon icon={ChromeIcons.Import} size={14} />
          Import
        </button>
        <button
          type="button"
          className="sigma-topbar-btn"
          onClick={() => {
            newDocument();
            router.push("/");
          }}
        >
          <Icon icon={ChromeIcons.Plus} size={14} />
          New
        </button>
        <button type="button" className="sigma-topbar-btn" onClick={undo}>
          <Icon icon={ChromeIcons.Undo2} size={14} />
          Undo
        </button>
        <button type="button" className="sigma-topbar-btn" onClick={redo}>
          <Icon icon={ChromeIcons.Redo2} size={14} />
          Redo
        </button>
        <button
          type="button"
          className="sigma-topbar-btn"
          title="Export selection or page as PNG"
          onClick={() => {
            const s = useDocumentStore.getState();
            void exportDocumentRegionToPng(s.doc, {
              nodeIds: s.selection.length ? s.selection : undefined,
              fileName: `${s.doc.name || "export"}.png`,
            })
              .then(() => setStatus("Exported PNG"))
              .catch((e) =>
                setStatus(
                  `Export failed: ${e instanceof Error ? e.message : String(e)}`
                )
              );
          }}
        >
          Export PNG
        </button>
      </nav>

      <input
        ref={fileRef}
        type="file"
        accept=".sig,.fig,application/zip"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImport(f);
          e.target.value = "";
        }}
      />

      <div className="sigma-topbar-title">
        <span className="sigma-topbar-docname">{doc.name}</span>
        {libraryFileId && (
          <span className="sigma-pill" title={`/file/${libraryFileId}`}>
            .sig · {libraryFileId.slice(0, 8)}
          </span>
        )}
      </div>

      <div className="sigma-topbar-zoom">
        <button
          type="button"
          className="sigma-topbar-btn"
          aria-label="Zoom out"
          onClick={() =>
            setViewport({ zoom: clampZoom(viewport.zoom / 1.25) })
          }
        >
          <Icon icon={ChromeIcons.ZoomOut} size={14} />
        </button>
        <span className="sigma-zoom-pct tabular" title="Canvas zoom">
          {formatZoomPercent(viewport.zoom)}
        </span>
        <button
          type="button"
          className="sigma-topbar-btn"
          aria-label="Zoom in"
          onClick={() =>
            setViewport({ zoom: clampZoom(viewport.zoom * 1.25) })
          }
        >
          <Icon icon={ChromeIcons.ZoomIn} size={14} />
        </button>
        {libraryFileId && (
          <button
            type="button"
            className="sigma-topbar-btn"
            title="Reload from library cache"
            onClick={() => void openFromLibrary(libraryFileId)}
          >
            <Icon icon={ChromeIcons.RefreshCw} size={14} />
            Reload
          </button>
        )}
      </div>

      <div
        className={`sigma-topbar-status ${loading ? "is-loading" : ""}`}
        title={status}
      >
        {status}
      </div>
    </header>
  );
}

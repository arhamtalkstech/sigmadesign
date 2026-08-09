"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { Canvas } from "./Canvas";
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
  const openFromLibrary = useDocumentStore((s) => s.openFromLibrary);
  const setStatus = useDocumentStore((s) => s.setStatus);
  const focusNode = useDocumentStore((s) => s.focusNode);
  const focusedOnce = useRef<string | null>(null);

  // Load file when route id changes
  useEffect(() => {
    if (!fileId) return;
    if (
      libraryFileId === fileId &&
      Object.keys(useDocumentStore.getState().doc.nodes).length > 0
    ) {
      return;
    }
    void (async () => {
      try {
        await openFromLibrary(fileId);
      } catch {
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

  // Persist session on unload
  useEffect(() => {
    const onLeave = () => useDocumentStore.getState().persistSession();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

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
      <div className="workspace">
        <ToolRail />
        <LayersPanel />
        <main id="canvas-main" className="canvas-main" tabIndex={-1}>
          <Canvas />
        </main>
        <PropertiesPanel />
      </div>
    </div>
  );
}

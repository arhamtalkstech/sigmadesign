"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createBlankLibraryFile,
  deleteLibraryFile,
  fetchLibrary,
  formatBytes,
  formatRelativeTime,
  importFileToLibrary,
  type LibraryFile,
} from "@/lib/library-api";
import { ChromeIcons, Icon } from "@/lib/chrome-icons";

/**
 * Library home at `/` — lists all opened/imported design files.
 * Opening a file navigates to `/file/{id}` (never swaps in-place to the editor).
 */
export function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [home, setHome] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const deepLinkHandled = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchLibrary();
      setFiles(data.files);
      setHome(data.home);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Deep links that start on home then navigate to /file/{id}
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const resume = searchParams.get("resume");
    if (resume === "1") {
      deepLinkHandled.current = true;
      void (async () => {
        const data = await refresh();
        if (data?.lastOpenFileId) {
          router.replace(`/file/${data.lastOpenFileId}`);
        }
      })();
    }
  }, [searchParams, router, refresh]);

  const openFile = (id: string) => {
    router.push(`/file/${id}`);
  };

  const onImport = async (file: File) => {
    setBusy(true);
    setError(null);
    setStatus(`Importing ${file.name}…`);
    try {
      const item = await importFileToLibrary(file);
      await refresh();
      router.push(`/file/${item.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setStatus(null);
    }
  };

  /** Empty canvas ready for clipboard paste (Ctrl/Cmd+V). */
  const onNewBlank = async () => {
    setBusy(true);
    setError(null);
    setStatus("Creating blank file…");
    try {
      const item = await createBlankLibraryFile("Untitled");
      await refresh();
      router.push(`/file/${item.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setStatus(null);
    }
  };

  const onDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Remove this file from your SigmaDesign library?")) return;
    try {
      await deleteLibraryFile(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="sigma-home">
      <div className="sigma-home-bg" aria-hidden />
      <a href="#library-main" className="skip-link">
        Skip to library
      </a>
      <header className="sigma-home-header">
        <div className="sigma-brand">
          <span className="sigma-logo" aria-hidden />
          <div>
            <div className="sigma-brand-name">SigmaDesign</div>
            <div className="sigma-brand-tag">
              Local design editor · private .sig library
            </div>
          </div>
        </div>
        <div className="sigma-home-actions">
          <button
            type="button"
            className="sigma-btn sigma-btn-ghost"
            onClick={() => void onNewBlank()}
            disabled={busy || loading}
            title="Empty canvas — paste design layers with Ctrl/Cmd+V"
          >
            <Icon icon={ChromeIcons.Plus} size={14} />
            New blank file
          </button>
          <button
            type="button"
            className="sigma-btn sigma-btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={busy || loading}
          >
            <Icon icon={ChromeIcons.Import} size={14} />
            Import design file
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".sig,.fig,application/zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
      </header>

      <main id="library-main" className="sigma-home-main">
        <section
          className={`sigma-dropzone ${dragOver ? "is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void onImport(f);
          }}
        >
          <div className="sigma-drop-kicker">Your library</div>
          <div className="sigma-drop-title">Drop a design file</div>
          <div className="sigma-drop-sub">
            Accepts <code>.sig</code> and <code>.fig</code> archives — or{" "}
            <strong>New blank file</strong>, then paste design layers with{" "}
            <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>V</kbd> on the canvas.
          </div>
        </section>

        {(busy || loading) && (
          <div className="sigma-status-banner" role="status">
            {status || "Loading library…"} Large files can take a few seconds on
            first import.
          </div>
        )}
        {error && (
          <div className="sigma-error-banner" role="alert">
            {error}
          </div>
        )}

        <section className="sigma-recent" aria-labelledby="library-heading">
          <div className="sigma-section-head">
            <h2 id="library-heading">
              Files
              {files.length > 0 && (
                <span className="sigma-count">{files.length}</span>
              )}
            </h2>
            {home && (
              <span className="sigma-path" title={home}>
                {home}
              </span>
            )}
          </div>

          {!loading && files.length === 0 && (
            <div className="sigma-empty">
              <p>
                No files yet. Import a design file (including <code>.fig</code>
                ) — SigmaDesign saves it as <code>.sig</code> and lists it here
                with a permanent file id.
              </p>
              <button
                type="button"
                className="sigma-btn sigma-btn-primary"
                onClick={() => void onSample()}
              >
                Try the sample design
              </button>
            </div>
          )}

          <div className="sigma-file-grid">
            {files.map((f) => (
              <article key={f.id} className="sigma-file-card-wrap">
                <button
                  type="button"
                  className="sigma-file-card"
                  onClick={() => openFile(f.id)}
                  disabled={busy}
                >
                  <div className="sigma-file-thumb">
                    <span className="sigma-file-ext">.sig</span>
                    {f.hasCache && <span className="sigma-badge">Ready</span>}
                  </div>
                  <div className="sigma-file-meta">
                    <div className="sigma-file-name">{f.name}</div>
                    <div className="sigma-file-id" title={f.id}>
                      /file/{f.id.slice(0, 10)}…
                    </div>
                    <div className="sigma-file-stats">
                      <span className="tabular">
                        {f.nodeCount.toLocaleString()}
                      </span>{" "}
                      nodes · {formatBytes(f.byteSize)}
                    </div>
                    <div className="sigma-file-time">
                      {formatRelativeTime(f.lastOpenedAt)}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="sigma-file-delete"
                  title="Remove from library"
                  aria-label={`Remove ${f.name}`}
                  onClick={(e) => void onDelete(e, f.id)}
                >
                  <Icon icon={ChromeIcons.X} size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <footer className="sigma-home-footer">
          <div>
            <strong>Design stays on your machine.</strong> Import once, edit
            locally, reopen from this list. No cloud seats required.
          </div>
          <div className="sigma-footer-muted">
            Each library entry has a stable file id at{" "}
            <code>/file/…</code>. <code>.sig</code> matches the structure of{" "}
            <code>.fig</code> design archives for import interoperability.
          </div>
        </footer>
      </main>
    </div>
  );
}

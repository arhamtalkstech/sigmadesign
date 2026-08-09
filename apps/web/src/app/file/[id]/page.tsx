import { Suspense } from "react";
import { Editor } from "@/components/Editor";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * Editor for a library file.
 * URL shape: /file/{libraryId} — stable id from SQLite library.
 */
export default async function FileEditorPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="app-shell">
          <div className="sigma-chrome-top">
            <div
              className="sigma-loading-bar"
              role="status"
              aria-live="polite"
            >
              <span className="sigma-loading-bar-fill" />
              <span className="sigma-loading-label">Opening file…</span>
            </div>
          </div>
          <div className="workspace" />
        </div>
      }
    >
      <Editor fileId={id} />
    </Suspense>
  );
}

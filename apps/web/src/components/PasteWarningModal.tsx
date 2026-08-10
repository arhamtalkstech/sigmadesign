"use client";

import { useEffect, useId, useRef } from "react";
import type { PasteWarning } from "@/store/document-store";

type Props = {
  warning: PasteWarning;
  onPasteAnyway: () => void;
  onImportInstead: () => void;
  onCancel: () => void;
};

/**
 * Shown when a design clipboard paste would drop image fills (or similar
 * assets that the source app does not put in the HTML clipboard).
 */
export function PasteWarningModal({
  warning,
  onPasteAnyway,
  onImportInstead,
  onCancel,
}: Props) {
  const titleId = useId();
  const descId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const { missingImages, availableImages, nodeCount } = warning;

  return (
    <div
      className="sigma-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="sigma-modal sigma-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="sigma-modal-icon" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7a2 2 0 0 1 2-2h3l1.5 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="13"
              r="2.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M16.5 9.5h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h2 id={titleId} className="sigma-modal-title">
          Some content cannot be pasted
        </h2>

        <div id={descId} className="sigma-modal-body">
          <p>
            Clipboard paste usually includes layout, vectors, and text — but{" "}
            <strong>not image pixels</strong>. This paste references{" "}
            <strong className="tabular">{missingImages.toLocaleString()}</strong>{" "}
            image fill{missingImages === 1 ? "" : "s"} that are missing
            {availableImages > 0
              ? ` (${availableImages.toLocaleString()} image${availableImages === 1 ? "" : "s"} available)`
              : ""}
            {nodeCount > 0
              ? ` · ~${nodeCount.toLocaleString()} layer${nodeCount === 1 ? "" : "s"} in the payload`
              : ""}
            .
          </p>

          <div className="sigma-modal-callout">
            <div className="sigma-modal-callout-title">
              Recommended: import a full .fig file
            </div>
            <p className="sigma-modal-callout-lead">
              That path keeps photos, mockups, and other bitmaps. Steps in the
              original design app:
            </p>
            <ol className="sigma-modal-steps">
              <li>
                Open the design file (community files: use{" "}
                <strong>Open in …</strong> / duplicate into your drafts if you
                only have a link).
              </li>
              <li>
                Top-left main menu → <strong>File</strong> →{" "}
                <strong>Save local copy</strong>.
              </li>
              <li>
                A <strong>.fig</strong> file downloads to your computer
                (usually the Downloads folder).
              </li>
              <li>
                Back here, click <strong>Import .fig instead</strong> and choose
                that file — or use <strong>Import design file</strong> on the
                library home.
              </li>
              <li>
                SigmaDesign stores a local <strong>.sig</strong> copy and opens
                it with images included.
              </li>
            </ol>
            <p className="sigma-modal-callout-note">
              If <strong>Save local copy</strong> is missing or greyed out, the
              file owner may have restricted downloading — ask for a .fig, or
              duplicate the file into a draft you own, then try again.
            </p>
          </div>

          <ul className="sigma-modal-list">
            <li>
              <strong>Paste structure only</strong> — frames, vectors, and text
              appear now; photo fills stay empty. You can still import a .fig
              later.
            </li>
            <li>
              <strong>Import .fig instead</strong> — full fidelity (recommended
              for device mockups and any file with images).
            </li>
          </ul>
        </div>

        <div className="sigma-modal-actions">
          <button
            type="button"
            className="sigma-btn sigma-btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sigma-btn sigma-btn-ghost"
            onClick={onPasteAnyway}
          >
            Paste structure only
          </button>
          <button
            ref={primaryRef}
            type="button"
            className="sigma-btn sigma-btn-primary"
            onClick={onImportInstead}
          >
            Import .fig instead
          </button>
        </div>
      </div>
    </div>
  );
}

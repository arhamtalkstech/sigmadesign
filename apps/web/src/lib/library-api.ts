/** Client helpers for SigmaDesign library API */

export type LibraryFile = {
  id: string;
  name: string;
  filename: string;
  sourceFormat: string;
  byteSize: number;
  nodeCount: number;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
  hasCache: boolean;
};

export type LibraryListResponse = {
  ok: boolean;
  home: string;
  libraryDir: string;
  files: LibraryFile[];
  lastOpenFileId: string | null;
};

export async function fetchLibrary(): Promise<LibraryListResponse> {
  const res = await fetch("/api/library", { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importFileToLibrary(file: File): Promise<LibraryFile> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/library", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Import failed");
  return data.file as LibraryFile;
}

/** Create an empty canvas file in the library (for clipboard paste / new work). */
export async function createBlankLibraryFile(
  name = "Untitled"
): Promise<LibraryFile> {
  const res = await fetch("/api/library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blank: true, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not create blank file");
  return data.file as LibraryFile;
}

export async function openLibraryFile(id: string) {
  const res = await fetch(`/api/library/${id}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Open failed");
  return data as {
    ok: true;
    id: string;
    name: string;
    doc: import("@alteron/document-model").AlteronDocument;
    viewport: { x: number; y: number; zoom: number } | null;
    selection: string[];
    expanded: string[];
    fromCache: boolean;
    home: string;
  };
}

export async function saveLibrarySession(
  id: string,
  state: {
    viewport?: { x: number; y: number; zoom: number };
    currentPageId?: string | null;
    expanded?: string[];
    selection?: string[];
  }
) {
  await fetch(`/api/library/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
}

/**
 * Persist full document content (auto-save after paste / edits).
 *
 * Chrome/Safari limit `keepalive` request bodies to ~64KB. Pasted design
 * documents are almost always larger, which surfaces as TypeError: Failed to
 * fetch. Only use keepalive for small session-style flushes; large saves use a
 * normal fetch so the full body is accepted.
 */
export async function saveLibraryDocument(
  id: string,
  doc: import("@alteron/document-model").AlteronDocument
): Promise<{ ok: boolean; nodeCount?: number; savedAt?: number }> {
  const body = JSON.stringify({ doc });
  // Chromium keepalive body limit is 64 KiB — stay under with margin
  const useKeepalive = body.length < 56_000;
  let res: Response;
  try {
    res = await fetch(`/api/library/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      ...(useKeepalive ? { keepalive: true } : {}),
    });
  } catch (err) {
    const mb = (body.length / (1024 * 1024)).toFixed(2);
    const reason =
      err instanceof Error ? err.message : String(err);
    throw new Error(
      `Document save failed (${reason}; payload ${mb} MB). Is the dev server running?`
    );
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Document save failed (HTTP ${res.status})`);
  }
  return res.json();
}

export async function deleteLibraryFile(id: string) {
  const res = await fetch(`/api/library/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Delete failed");
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeTime(ts: number | null): string {
  if (!ts) return "Never opened";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

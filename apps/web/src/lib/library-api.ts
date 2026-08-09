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

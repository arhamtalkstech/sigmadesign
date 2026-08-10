/**
 * SigmaDesign local library service.
 *
 * - Stores design files as `.sig` under SIGMADESIGN_HOME/library
 * - Indexes metadata + session (viewport, selection) in SQLite
 * - Caches decoded ADM JSON for fast reopen (versioned; bump ADM_CACHE_VERSION
 *   when import/path semantics change)
 *
 * `.sig` uses the same archive layout as compatible `.fig` design ZIPs
 * (kiwi scene graph + images); the extension marks files as SigmaDesign-owned.
 */
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { importFigFile } from "@alteron/fig-import";
import {
  createEmptyDocument,
  type AlteronDocument,
} from "@alteron/document-model";
import {
  deleteLibraryFile,
  getLibraryFile,
  listLibraryFiles,
  setLastOpenFile,
  touchOpened,
  updateSessionState,
  upsertLibraryFile,
  type LibraryFileRow,
} from "./db";
import {
  cachePathForId,
  ensureSigmaDirs,
  getLibraryDir,
  getSigmaHome,
  sigPathForId,
} from "./paths";
import {
  BLANK_SIG_MAGIC,
  isAdmSigFile,
  readAdmSigDocument,
  writeAdmSigDocument,
} from "./sig-format";

const isBlankSigFile = isAdmSigFile;
const readBlankSigDocument = readAdmSigDocument;
const writeBlankSigDocument = writeAdmSigDocument;

export type LibraryListItem = {
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

export type OpenLibraryResult = {
  id: string;
  name: string;
  doc: AlteronDocument;
  viewport: { x: number; y: number; zoom: number } | null;
  selection: string[];
  expanded: string[];
  fromCache: boolean;
  home: string;
};

function rowToListItem(row: LibraryFileRow): LibraryListItem {
  return {
    id: row.id,
    name: row.name,
    filename: row.filename,
    sourceFormat: row.source_format,
    byteSize: row.byte_size,
    nodeCount: row.node_count,
    pageCount: row.page_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    hasCache: existsSync(cachePathForId(row.id)),
  };
}

export function getLibraryInfo() {
  ensureSigmaDirs();
  return {
    home: getSigmaHome(),
    libraryDir: getLibraryDir(),
    files: listLibraryFiles(200).map(rowToListItem),
  };
}

function sanitizeName(name: string): string {
  return name
    .replace(/\.(fig|sig)$/i, "")
    .replace(/[^\w\s\-_.()]+/g, "")
    .trim()
    .slice(0, 120) || "Untitled";
}

/** Bump when import/expansion semantics change so disk ADM caches rebuild. */
/** Bump when import/render semantics change (forces ADM reimport). */
const ADM_CACHE_VERSION = 5;

/** In-process document cache (fast re-open in same server process). */
const memoryDocCache = new Map<
  string,
  { mtimeMs: number; version: number; doc: AlteronDocument }
>();

function writeCache(id: string, doc: AlteronDocument, mtimeMs: number) {
  try {
    writeFileSync(
      cachePathForId(id),
      JSON.stringify({ v: ADM_CACHE_VERSION, doc }),
      "utf8"
    );
    const row = getLibraryFile(id);
    if (row) {
      upsertLibraryFile({
        ...row,
        cache_mtime_ms: mtimeMs,
      });
    }
  } catch (err) {
    console.warn("[sigmadesign] cache write failed", err);
  }
}

function readCache(id: string, mtimeMs: number): AlteronDocument | null {
  const mem = memoryDocCache.get(id);
  if (mem && mem.mtimeMs === mtimeMs && mem.version === ADM_CACHE_VERSION) {
    return mem.doc;
  }

  const path = cachePathForId(id);
  if (!existsSync(path)) return null;
  const row = getLibraryFile(id);
  if (row?.cache_mtime_ms != null && row.cache_mtime_ms !== mtimeMs) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as
      | AlteronDocument
      | { v?: number; doc?: AlteronDocument };
    // Legacy flat cache (pre-version) or version mismatch → reimport
    if (!raw || typeof raw !== "object") return null;
    if ("nodes" in raw && !("v" in raw)) return null;
    const wrapped = raw as { v?: number; doc?: AlteronDocument };
    if (wrapped.v !== ADM_CACHE_VERSION || !wrapped.doc?.nodes) return null;
    memoryDocCache.set(id, {
      mtimeMs,
      version: ADM_CACHE_VERSION,
      doc: wrapped.doc,
    });
    return wrapped.doc;
  } catch {
    return null;
  }
}

/**
 * Import a .fig or .sig buffer into the library as a .sig file.
 * Runs full import once, writes ADM cache for instant reopen.
 */
export async function importToLibrary(
  buffer: Buffer | Uint8Array,
  originalName: string,
  options?: { sourceFormat?: "sig" | "fig" | "sample"; id?: string }
): Promise<LibraryListItem> {
  ensureSigmaDirs();
  const id = options?.id ?? randomUUID().replace(/-/g, "").slice(0, 16);
  const name = sanitizeName(originalName);
  const filename = `${id}.sig`;
  const dest = sigPathForId(id);
  const bytes = Buffer.from(buffer);

  writeFileSync(dest, bytes);

  const doc = await importFigFile(bytes);
  doc.name = name;
  if (doc.meta) {
    doc.meta.source =
      options?.sourceFormat === "sample"
        ? "alteron"
        : options?.sourceFormat === "fig"
          ? "fig-import"
          : "alteron";
  }

  const mtimeMs = statSync(dest).mtimeMs;
  memoryDocCache.set(id, { mtimeMs, version: ADM_CACHE_VERSION, doc });

  const row = upsertLibraryFile({
    id,
    name,
    filename,
    source_format: options?.sourceFormat ?? "sig",
    byte_size: bytes.byteLength,
    node_count: Object.keys(doc.nodes).length,
    page_count: doc.pages.length,
    last_opened_at: Date.now(),
    viewport_json: null,
    current_page_id: doc.currentPageId,
    expanded_json: null,
    selection_json: null,
    thumbnail_path: null,
    cache_mtime_ms: mtimeMs,
    notes: null,
  });

  writeCache(id, doc, mtimeMs);
  setLastOpenFile(id);
  return rowToListItem(row);
}

/**
 * Create an empty canvas in the library (for paste / new work).
 * Writes a small marker .sig + ADM cache so reopen works without a full archive.
 */
export async function createBlankLibraryFile(
  name = "Untitled"
): Promise<LibraryListItem> {
  ensureSigmaDirs();
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  const safeName = sanitizeName(name.endsWith(".sig") ? name : `${name}.sig`);
  const filename = `${id}.sig`;
  const dest = sigPathForId(id);

  writeFileSync(dest, BLANK_SIG_MAGIC);
  const doc = createEmptyDocument(safeName.replace(/\.sig$/i, ""));
  doc.meta = { ...doc.meta, source: "blank" };

  const mtimeMs = statSync(dest).mtimeMs;
  memoryDocCache.set(id, { mtimeMs, version: ADM_CACHE_VERSION, doc });

  const row = upsertLibraryFile({
    id,
    name: doc.name,
    filename,
    source_format: "sig",
    byte_size: BLANK_SIG_MAGIC.byteLength,
    node_count: Object.keys(doc.nodes).length,
    page_count: doc.pages.length,
    last_opened_at: Date.now(),
    viewport_json: JSON.stringify({ x: 80, y: 80, zoom: 1 }),
    current_page_id: doc.currentPageId,
    expanded_json: null,
    selection_json: null,
    thumbnail_path: null,
    cache_mtime_ms: mtimeMs,
    notes: "blank",
  });

  writeCache(id, doc, mtimeMs);
  setLastOpenFile(id);
  return rowToListItem(row);
}

export async function openLibraryFile(id: string): Promise<OpenLibraryResult> {
  ensureSigmaDirs();
  const row = getLibraryFile(id);
  if (!row) throw new Error(`File not found in library: ${id}`);

  const path = join(getLibraryDir(), row.filename);
  if (!existsSync(path)) {
    throw new Error(`Missing library file on disk: ${path}`);
  }

  const mtimeMs = statSync(path).mtimeMs;
  const bytes = readFileSync(path);
  let fromCache = false;
  let doc: AlteronDocument;

  // Magic SIGMABLANK = self-contained ADM writeback (edits survive without cache)
  if (isBlankSigFile(bytes)) {
    doc = readBlankSigDocument(bytes, row.name);
  } else {
    const cached = readCache(id, mtimeMs);
    if (cached) {
      doc = cached;
      fromCache = true;
    } else {
      doc = await importFigFile(bytes);
    }
  }
  doc.name = row.name;
  if (!fromCache) {
    writeCache(id, doc, mtimeMs);
  }
  memoryDocCache.set(id, {
    mtimeMs,
    version: ADM_CACHE_VERSION,
    doc,
  });

  // Restore page if saved
  if (row.current_page_id && doc.pages.some((p) => p.id === row.current_page_id)) {
    doc.currentPageId = row.current_page_id;
  }

  touchOpened(id);
  setLastOpenFile(id);

  let viewport: OpenLibraryResult["viewport"] = null;
  if (row.viewport_json) {
    try {
      viewport = JSON.parse(row.viewport_json);
    } catch {
      viewport = null;
    }
  }

  let selection: string[] = [];
  let expanded: string[] = [];
  try {
    if (row.selection_json) selection = JSON.parse(row.selection_json);
    if (row.expanded_json) expanded = JSON.parse(row.expanded_json);
  } catch {
    /* ignore */
  }

  return {
    id,
    name: row.name,
    doc,
    viewport,
    selection,
    expanded,
    fromCache,
    home: getSigmaHome(),
  };
}

export function saveLibrarySession(
  id: string,
  state: {
    viewport?: { x: number; y: number; zoom: number };
    currentPageId?: string | null;
    expanded?: string[];
    selection?: string[];
  }
) {
  updateSessionState(id, state);
}

/**
 * Persist full document content for a library file (auto-save after paste/edits).
 * Always writes a self-contained SIGMABLANK + ADM JSON `.sig` so reopening does
 * not depend solely on the ADM cache (works for blank and formerly-imported files).
 */
export function saveLibraryDocument(
  id: string,
  doc: AlteronDocument
): { ok: true; nodeCount: number; savedAt: number } {
  ensureSigmaDirs();
  const row = getLibraryFile(id);
  if (!row) throw new Error(`File not found in library: ${id}`);

  const path = join(getLibraryDir(), row.filename);
  if (!existsSync(path)) {
    throw new Error(`Missing library file on disk: ${path}`);
  }

  const payloadDoc = { ...doc, name: row.name };
  const mtimeMs = writeBlankSigDocument(path, payloadDoc);

  writeCache(id, payloadDoc, mtimeMs);
  memoryDocCache.set(id, {
    mtimeMs,
    version: ADM_CACHE_VERSION,
    doc: payloadDoc,
  });

  const byteSize = statSync(path).size;
  upsertLibraryFile({
    ...row,
    node_count: Object.keys(doc.nodes).length,
    page_count: doc.pages.length,
    byte_size: byteSize,
    cache_mtime_ms: mtimeMs,
    current_page_id: doc.currentPageId,
    // After first save, library entry is always self-contained ADM
    notes: row.notes === "blank" ? "blank" : "edited-adm",
    source_format: row.source_format || "sig",
  });

  return {
    ok: true,
    nodeCount: Object.keys(doc.nodes).length,
    savedAt: Date.now(),
  };
}

export function removeLibraryFile(id: string): boolean {
  const row = getLibraryFile(id);
  if (!row) return false;
  const path = join(getLibraryDir(), row.filename);
  const cache = cachePathForId(id);
  try {
    if (existsSync(path)) unlinkSync(path);
    if (existsSync(cache)) unlinkSync(cache);
  } catch {
    /* continue */
  }
  memoryDocCache.delete(id);
  deleteLibraryFile(id);
  return true;
}

/** Copy existing disk path (user's .fig/.sig) into library. */
export async function importFromDiskPath(
  absolutePath: string
): Promise<LibraryListItem> {
  const buf = readFileSync(absolutePath);
  const base = basename(absolutePath);
  const format = /\.sig$/i.test(base) ? "sig" : "fig";
  return importToLibrary(buf, base, { sourceFormat: format });
}

export function renameLibraryFile(id: string, name: string): LibraryListItem | null {
  const row = getLibraryFile(id);
  if (!row) return null;
  const next = upsertLibraryFile({
    ...row,
    name: sanitizeName(name),
  });
  return rowToListItem(next);
}

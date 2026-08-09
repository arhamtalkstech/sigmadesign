import Database from "better-sqlite3";
import { getDbPath, ensureSigmaDirs } from "./paths";

export interface LibraryFileRow {
  id: string;
  name: string;
  /** Relative path under library/ e.g. "abc.sig" */
  filename: string;
  source_format: "sig" | "fig" | "sample";
  byte_size: number;
  node_count: number;
  page_count: number;
  created_at: number;
  updated_at: number;
  last_opened_at: number | null;
  /** JSON: { x, y, zoom } */
  viewport_json: string | null;
  current_page_id: string | null;
  /** JSON string array of expanded node ids (capped) */
  expanded_json: string | null;
  selection_json: string | null;
  thumbnail_path: string | null;
  /** mtime of .sig used when cache was written */
  cache_mtime_ms: number | null;
  notes: string | null;
}

export interface SettingRow {
  key: string;
  value: string;
}

let dbSingleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton;
  ensureSigmaDirs();
  const db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      filename TEXT NOT NULL UNIQUE,
      source_format TEXT NOT NULL DEFAULT 'sig',
      byte_size INTEGER NOT NULL DEFAULT 0,
      node_count INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_opened_at INTEGER,
      viewport_json TEXT,
      current_page_id TEXT,
      expanded_json TEXT,
      selection_json TEXT,
      thumbnail_path TEXT,
      cache_mtime_ms INTEGER,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_library_last_opened
      ON library_files(last_opened_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS open_sessions (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      file_id TEXT,
      updated_at INTEGER
    );
  `);
  dbSingleton = db;
  return db;
}

export function listLibraryFiles(limit = 100): LibraryFileRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM library_files
       ORDER BY COALESCE(last_opened_at, updated_at) DESC
       LIMIT ?`
    )
    .all(limit) as LibraryFileRow[];
}

export function getLibraryFile(id: string): LibraryFileRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM library_files WHERE id = ?`)
    .get(id) as LibraryFileRow | undefined;
}

export function upsertLibraryFile(
  row: Omit<LibraryFileRow, "created_at" | "updated_at"> & {
    created_at?: number;
    updated_at?: number;
  }
): LibraryFileRow {
  const db = getDb();
  const now = Date.now();
  const existing = getLibraryFile(row.id);
  const created = existing?.created_at ?? row.created_at ?? now;
  const updated = row.updated_at ?? now;
  db.prepare(
    `INSERT INTO library_files (
      id, name, filename, source_format, byte_size, node_count, page_count,
      created_at, updated_at, last_opened_at, viewport_json, current_page_id,
      expanded_json, selection_json, thumbnail_path, cache_mtime_ms, notes
    ) VALUES (
      @id, @name, @filename, @source_format, @byte_size, @node_count, @page_count,
      @created_at, @updated_at, @last_opened_at, @viewport_json, @current_page_id,
      @expanded_json, @selection_json, @thumbnail_path, @cache_mtime_ms, @notes
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      filename = excluded.filename,
      source_format = excluded.source_format,
      byte_size = excluded.byte_size,
      node_count = excluded.node_count,
      page_count = excluded.page_count,
      updated_at = excluded.updated_at,
      last_opened_at = COALESCE(excluded.last_opened_at, library_files.last_opened_at),
      viewport_json = COALESCE(excluded.viewport_json, library_files.viewport_json),
      current_page_id = COALESCE(excluded.current_page_id, library_files.current_page_id),
      expanded_json = COALESCE(excluded.expanded_json, library_files.expanded_json),
      selection_json = COALESCE(excluded.selection_json, library_files.selection_json),
      thumbnail_path = COALESCE(excluded.thumbnail_path, library_files.thumbnail_path),
      cache_mtime_ms = COALESCE(excluded.cache_mtime_ms, library_files.cache_mtime_ms),
      notes = COALESCE(excluded.notes, library_files.notes)`
  ).run({
    id: row.id,
    name: row.name,
    filename: row.filename,
    source_format: row.source_format,
    byte_size: row.byte_size,
    node_count: row.node_count,
    page_count: row.page_count,
    created_at: created,
    updated_at: updated,
    last_opened_at: row.last_opened_at ?? null,
    viewport_json: row.viewport_json ?? null,
    current_page_id: row.current_page_id ?? null,
    expanded_json: row.expanded_json ?? null,
    selection_json: row.selection_json ?? null,
    thumbnail_path: row.thumbnail_path ?? null,
    cache_mtime_ms: row.cache_mtime_ms ?? null,
    notes: row.notes ?? null,
  });
  return getLibraryFile(row.id)!;
}

export function touchOpened(id: string): void {
  getDb()
    .prepare(
      `UPDATE library_files SET last_opened_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(Date.now(), Date.now(), id);
}

export function updateSessionState(
  id: string,
  state: {
    viewport?: { x: number; y: number; zoom: number };
    currentPageId?: string | null;
    expanded?: string[];
    selection?: string[];
  }
): void {
  const row = getLibraryFile(id);
  if (!row) return;
  const patches: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: Date.now() };
  if (state.viewport) {
    patches.push("viewport_json = @viewport_json");
    params.viewport_json = JSON.stringify(state.viewport);
  }
  if (state.currentPageId !== undefined) {
    patches.push("current_page_id = @current_page_id");
    params.current_page_id = state.currentPageId;
  }
  if (state.expanded) {
    patches.push("expanded_json = @expanded_json");
    params.expanded_json = JSON.stringify(state.expanded.slice(0, 500));
  }
  if (state.selection) {
    patches.push("selection_json = @selection_json");
    params.selection_json = JSON.stringify(state.selection.slice(0, 100));
  }
  if (!patches.length) return;
  patches.push("updated_at = @updated_at");
  getDb()
    .prepare(`UPDATE library_files SET ${patches.join(", ")} WHERE id = @id`)
    .run(params);
}

export function setLastOpenFile(fileId: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO open_sessions (id, file_id, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET file_id = excluded.file_id, updated_at = excluded.updated_at`
    )
    .run(fileId, Date.now());
}

export function getLastOpenFileId(): string | null {
  const row = getDb()
    .prepare(`SELECT file_id FROM open_sessions WHERE id = 1`)
    .get() as { file_id: string | null } | undefined;
  return row?.file_id ?? null;
}

export function deleteLibraryFile(id: string): boolean {
  const r = getDb().prepare(`DELETE FROM library_files WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

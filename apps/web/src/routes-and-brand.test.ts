/**
 * Gating tests: real routes + user-visible brand surface.
 * Drives shipped source files (not reimplemented stubs).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getLibraryInfo } from "./server/library-service";
import { getLastOpenFileId, listLibraryFiles } from "./server/db";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src");

function read(rel: string) {
  return readFileSync(resolve(src, rel), "utf8");
}

/** Strip line+block comments so technical markers (e.g. clipboard HTML) don't false-positive. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Collect double/single-quoted and template string literals (simple). */
function stringLiterals(code: string): string[] {
  const out: string[] = [];
  const re = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    out.push(m[2] ?? "");
  }
  return out;
}

describe("routes: library home vs file editor", () => {
  it("ships / as library-only page (HomeClient, not Editor)", () => {
    const page = read("app/page.tsx");
    expect(page).toMatch(/HomeClient/);
    expect(page).not.toMatch(/from ["']@\/components\/Editor["']/);
    expect(page).not.toMatch(/<Editor/);
  });

  it("ships /file/[id] as Editor for library file id", () => {
    const path = resolve(src, "app/file/[id]/page.tsx");
    expect(existsSync(path)).toBe(true);
    const page = readFileSync(path, "utf8");
    expect(page).toMatch(/Editor/);
    expect(page).toMatch(/fileId/);
    expect(page).toMatch(/params/);
  });

  it("Home navigates to /file/{id} instead of in-place view swap", () => {
    const home = read("components/Home.tsx");
    expect(home).toMatch(/\/file\/\$\{/);
    expect(home).toMatch(/router\.(push|replace)/);
    expect(home).not.toMatch(/view:\s*["']editor["']/);
  });

  it("Editor does not render Home / library list", () => {
    const ed = read("components/Editor.tsx");
    expect(ed).not.toMatch(/from ["']\.\/Home["']/);
    expect(ed).not.toMatch(/view === ["']home["']/);
    expect(ed).toMatch(/fileId/);
  });

  it("Canvas drop-import navigates with location.assign(url), not assignment", () => {
    const canvas = read("components/Canvas.tsx");
    // Regression: `window.location.assign = path` overwrites the function and never navigates
    expect(canvas).not.toMatch(/location\.assign\s*=/);
    expect(canvas).toMatch(/location\.assign\(\s*[`'"]\/file\//);
  });
});

describe("library ids (SQLite-backed)", () => {
  it("listLibraryFiles returns stable id fields from real DB layer", () => {
    const info = getLibraryInfo();
    expect(info.home).toBeTruthy();
    expect(Array.isArray(info.files)).toBe(true);
    for (const f of info.files) {
      expect(typeof f.id).toBe("string");
      expect(f.id.length).toBeGreaterThan(4);
      expect(f.filename).toMatch(/\.sig$/);
    }
    // If any file was opened, lastOpenFileId is a library id
    const last = getLastOpenFileId();
    if (last) {
      const rows = listLibraryFiles(200);
      expect(rows.some((r) => r.id === last)).toBe(true);
    }
  });
});

describe("routes: agents / connect page", () => {
  it("ships /connect as agents setup surface with skill download", () => {
    const path = resolve(src, "app/connect/page.tsx");
    expect(existsSync(path)).toBe(true);
    const page = readFileSync(path, "utf8");
    expect(page).toMatch(/ConnectClient/);
    const client = read("app/connect/connect-client.tsx");
    expect(client).toMatch(/Download skill zip|skill zip/i);
    expect(client).toMatch(/sigmadesign-implement\.zip/);
    expect(client).toMatch(/list_library_files|Available tools|pnpm mcp/);
    // Must not pull Node-only MCP handlers into the client bundle
    expect(client).not.toMatch(/@\/mcp\/tools["']/);
    expect(client).toMatch(/@\/mcp\/tool-catalog/);
  });

  it("tool-catalog is browser-safe (no node: or library-service imports)", () => {
    const cat = read("mcp/tool-catalog.ts");
    expect(cat).not.toMatch(/node:fs|better-sqlite3|library-service|from ["']@\/server\//);
    expect(cat).toMatch(/list_library_files/);
    expect(cat).toMatch(/get_design_context/);
  });

  it("library home and top bar link to /connect without putting agent copy on Editor canvas", () => {
    const home = read("components/Home.tsx");
    expect(home).toMatch(/\/connect/);
    const top = read("components/TopBar.tsx");
    expect(top).toMatch(/\/connect/);
    const ed = read("components/Editor.tsx");
    expect(ed).not.toMatch(/\/connect/);
    expect(ed).not.toMatch(/\bMCP\b/i);
    expect(ed).not.toMatch(/connector/i);
    const canvas = read("components/Canvas.tsx");
    expect(canvas).not.toMatch(/\bMCP\b/i);
    expect(canvas).not.toMatch(/connector/i);
  });
});

describe("user-visible brand: no Figma wording", () => {
  const uiFiles = [
    "components/Home.tsx",
    "components/TopBar.tsx",
    "components/Canvas.tsx",
    "components/Editor.tsx",
    "components/LayersPanel.tsx",
    "components/PropertiesPanel.tsx",
    "components/ToolRail.tsx",
    "app/layout.tsx",
    "app/page.tsx",
    "app/home-client.tsx",
  ];

  it("has no Figma/figma in user-facing string literals under UI surfaces", () => {
    const hits: string[] = [];
    for (const rel of uiFiles) {
      const raw = read(rel);
      // Keep clipboard marker detection out of brand check (implementation detail)
      const code = stripComments(raw).replace(
        /html\.includes\(["'`]<!--\(figma\)["'`]/g,
        'html.includes("DESIGN_CLIPBOARD_MARKER")'
      );
      for (const lit of stringLiterals(code)) {
        if (/figma/i.test(lit) && !/\.fig\b/i.test(lit.replace(/figma/gi, ""))) {
          // Allow .fig extension mentions; ban Figma product name
          if (/figma/i.test(lit)) {
            // If literal is only about .fig extension, OK
            const withoutFigExt = lit.replace(/\.fig/gi, "");
            if (/figma/i.test(withoutFigExt)) {
              hits.push(`${rel}: "${lit.slice(0, 80)}"`);
            }
          }
        }
      }
    }
    // README is outside apps/web/src but plan requires scrub — checked in separate script
    expect(hits).toEqual([]);
  });
});

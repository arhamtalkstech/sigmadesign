/**
 * Gating tests: real tool handlers against a temp SIGMADESIGN_HOME library.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createEmptyDocument,
  createShapeInDocument,
  applyNodePatch,
} from "@alteron/document-model";
import { encodeAdmSig } from "@/server/sig-format";
import { callTool, listToolNames, TOOL_DEFINITIONS } from "./tools";
import { upsertLibraryFile } from "@/server/db";
import { ensureSigmaDirs, sigPathForId } from "@/server/paths";

const prevHome = process.env.SIGMADESIGN_HOME;
const testHome = join(tmpdir(), `sigma-mcp-test-${Date.now()}`);
const fileId = "mcpfixture001abc";

beforeAll(() => {
  process.env.SIGMADESIGN_HOME = testHome;
  ensureSigmaDirs();

  let doc = createEmptyDocument("MCP Fixture");
  const frame = createShapeInDocument(doc, "FRAME", 0, 0, 320, 200, {
    name: "Hero",
  });
  doc = frame.doc;
  const text = createShapeInDocument(doc, "TEXT", 16, 16, 200, 32, {
    name: "Title",
    parentId: frame.id,
  });
  doc = text.doc;
  doc = applyNodePatch(doc, text.id, {
    characters: "Hello Sigma",
    textStyle: {
      fontFamily: "Inter",
      fontStyle: "Bold",
      fontSize: 24,
    },
  } as never);

  const path = sigPathForId(fileId);
  writeFileSync(path, encodeAdmSig(doc));
  const now = Date.now();
  upsertLibraryFile({
    id: fileId,
    name: "MCP Fixture",
    filename: `${fileId}.sig`,
    source_format: "sig",
    byte_size: 1000,
    node_count: Object.keys(doc.nodes).length,
    page_count: 1,
    last_opened_at: now,
    viewport_json: null,
    current_page_id: doc.currentPageId,
    expanded_json: null,
    selection_json: null,
    thumbnail_path: null,
    cache_mtime_ms: null,
    notes: "blank",
  });
});

afterAll(() => {
  if (prevHome === undefined) delete process.env.SIGMADESIGN_HOME;
  else process.env.SIGMADESIGN_HOME = prevHome;
  try {
    rmSync(testHome, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("MCP tool registry", () => {
  it("exposes a non-empty documented tool list", () => {
    const names = listToolNames();
    expect(names.length).toBeGreaterThanOrEqual(15);
    expect(names).toContain("list_library_files");
    expect(names).toContain("get_design_context");
    expect(names).toContain("get_screenshot");
    expect(names).toContain("create_rectangle");
    expect(names).toContain("update_node");
    expect(TOOL_DEFINITIONS.every((t) => t.name && t.description)).toBe(true);
  });
});

describe("MCP tool handlers (real library path)", () => {
  it("list_library_files returns the fixture entry", async () => {
    const r = await callTool("list_library_files", {});
    expect(r.isError).toBeFalsy();
    const text = r.content.find((c) => c.type === "text");
    expect(text && text.type === "text" ? text.text : "").toContain(fileId);
    expect(text && text.type === "text" ? text.text : "").toContain("MCP Fixture");
  });

  it("open_document and get_design_context return non-empty structure", async () => {
    const open = await callTool("open_document", { fileId });
    expect(open.isError).toBeFalsy();
    const openText = open.content[0];
    expect(openText?.type).toBe("text");
    if (openText?.type !== "text") return;
    const summary = JSON.parse(openText.text) as { nodeCount: number };
    expect(summary.nodeCount).toBeGreaterThan(0);

    // Find Hero frame via search
    const search = await callTool("search_layers", {
      fileId,
      query: "Hero",
    });
    expect(search.isError).toBeFalsy();
    const sText = search.content[0];
    expect(sText?.type).toBe("text");
    if (sText?.type !== "text") return;
    const hits = JSON.parse(sText.text) as {
      results: Array<{ id: string; name: string }>;
    };
    expect(hits.results.length).toBeGreaterThan(0);
    const heroId = hits.results[0]!.id;

    const ctx = await callTool("get_design_context", {
      fileId,
      nodeId: heroId,
      depth: 3,
    });
    expect(ctx.isError).toBeFalsy();
    const cText = ctx.content[0];
    expect(cText?.type).toBe("text");
    if (cText?.type !== "text") return;
    const body = JSON.parse(cText.text) as {
      nodeCount: number;
      nodes: Array<{ name: string }>;
    };
    expect(body.nodeCount).toBeGreaterThan(0);
    expect(body.nodes.some((n) => n.name === "Hero")).toBe(true);
  });

  it("get_styles and get_variables return usable payloads", async () => {
    const styles = await callTool("get_styles", { fileId });
    expect(styles.isError).toBeFalsy();
    const st = styles.content[0];
    expect(st?.type).toBe("text");
    if (st?.type === "text") {
      const body = JSON.parse(st.text) as { styles: Record<string, unknown> };
      expect(body.styles).toBeDefined();
    }
    const vars = await callTool("get_variables", { fileId });
    expect(vars.isError).toBeFalsy();
  });

  it("create_rectangle mutates library (beyond read-only design MCPs)", async () => {
    const before = await callTool("open_document", { fileId });
    const bText = before.content[0];
    if (bText?.type !== "text") throw new Error("bad open");
    const beforeCount = (JSON.parse(bText.text) as { nodeCount: number })
      .nodeCount;

    const created = await callTool("create_rectangle", {
      fileId,
      x: 40,
      y: 40,
      width: 80,
      height: 40,
      name: "AgentRect",
    });
    expect(created.isError).toBeFalsy();
    const cText = created.content[0];
    expect(cText?.type).toBe("text");
    if (cText?.type !== "text") return;
    const body = JSON.parse(cText.text) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id).toBeTruthy();

    const after = await callTool("open_document", { fileId });
    const aText = after.content[0];
    if (aText?.type !== "text") throw new Error("bad open");
    const afterCount = (JSON.parse(aText.text) as { nodeCount: number })
      .nodeCount;
    expect(afterCount).toBe(beforeCount + 1);

    const renamed = await callTool("rename_node", {
      fileId,
      nodeId: body.id,
      name: "AgentRectRenamed",
    });
    expect(renamed.isError).toBeFalsy();

    const node = await callTool("get_node", { fileId, nodeId: body.id });
    const nText = node.content[0];
    if (nText?.type !== "text") return;
    expect(JSON.parse(nText.text).name).toBe("AgentRectRenamed");
  });

  it("get_code_hints returns implementation guidance", async () => {
    const search = await callTool("search_layers", { fileId, query: "Hero" });
    const sText = search.content[0];
    if (sText?.type !== "text") return;
    const heroId = (
      JSON.parse(sText.text) as { results: Array<{ id: string }> }
    ).results[0]!.id;
    const hints = await callTool("get_code_hints", {
      fileId,
      nodeId: heroId,
    });
    expect(hints.isError).toBeFalsy();
    const hText = hints.content[0];
    if (hText?.type !== "text") return;
    const body = JSON.parse(hText.text) as {
      guidance: string[];
      root: { suggestedTag: string };
    };
    expect(body.guidance.length).toBeGreaterThan(0);
    expect(body.root.suggestedTag).toBeTruthy();
  });
});

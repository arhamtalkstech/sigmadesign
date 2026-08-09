import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importFigFile } from "./index.js";

/** Optional local fixture — not part of the product distribution. */
const SAMPLE = resolve(
  import.meta.dirname,
  "../../../sample-figma-file.fig"
);

describe("fig-import", () => {
  it("imports a local sample archive into ADM when present", async () => {
    if (!existsSync(SAMPLE)) {
      console.warn(
        "[fig-import] skip: no sample-figma-file.fig at repo root (dev fixture only)"
      );
      return;
    }
    const doc = await importFigFile(readFileSync(SAMPLE));
    expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(doc.nodes).length).toBeGreaterThan(100);
    expect(doc.currentPageId).toBeTruthy();
    expect(doc.figmaSchemaBase64).toBeTruthy();

    const page = doc.pages.find((p) => p.id === doc.currentPageId)!;
    expect(page.children.length).toBeGreaterThan(0);

    const first = doc.nodes[page.children[0]!];
    expect(first?.absoluteBounds).toBeDefined();
  }, 120_000);
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readFigFile, summarizeMessage } from "./index.js";

/**
 * Optional local fixture for fidelity tests. Not shipped in the product —
 * place a design archive at repo root as `sample-figma-file.fig` to enable.
 */
const SAMPLE = resolve(import.meta.dirname, "../../../sample-figma-file.fig");

describe("fig-format", () => {
  it("decodes a local sample archive when present", async () => {
    if (!existsSync(SAMPLE)) {
      console.warn(
        "[fig-format] skip: no sample-figma-file.fig at repo root (dev fixture only)"
      );
      return;
    }
    const buf = readFileSync(SAMPLE);
    const decoded = await readFigFile(buf);
    const summary = summarizeMessage(decoded.message);

    expect(decoded.header.prelude).toBe("fig-kiwi");
    expect(decoded.header.version).toBeGreaterThan(0);
    expect(summary.nodeCount).toBeGreaterThan(100);
    expect(decoded.images.size).toBeGreaterThanOrEqual(0);
    expect(decoded.schemaBytes.length).toBeGreaterThan(100);
  }, 60_000);
});

/**
 * Regression: CMDK / menu Icon Leading slots use OVERRIDDEN_SYMBOL_ID
 * component props. Without applying them every item shows the master's
 * default Lucide circle-help ("?") instead of calculator, etc.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importFigFile } from "./index.js";

const SAMPLE = resolve(import.meta.dirname, "../../../sample-figma-file.fig");

describe("instance-swap icon props", () => {
  it("swaps Icon Leading to calculator (not circle-help) on CMDK Category item", async () => {
    if (!existsSync(SAMPLE)) return;
    const doc = await importFigFile(new Uint8Array(readFileSync(SAMPLE)));

    // 1:13974 — Command Base / CMDK Item "Category 1"
    // prop 4:50 → Lucide calculator 1:3629; default master is circle-help 1:2629
    const item = doc.nodes["1:13974"];
    expect(item).toBeTruthy();

    const wrap = item!.children
      .map((id) => doc.nodes[id])
      .find((n) => n?.name === "Wrap");
    expect(wrap).toBeTruthy();

    const leading = wrap!.children
      .map((id) => doc.nodes[id])
      .find((n) => n?.name === "Icon Leading");
    expect(leading).toBeTruthy();
    expect(leading!.type).toBe("INSTANCE");
    expect(
      "componentId" in leading! ? leading.componentId : undefined
    ).toBe("1:3629");

    // Should expand real calculator geometry (not a lone bounding rect)
    const vectors = leading!.children
      .map((id) => doc.nodes[id])
      .filter((n) => n && ((n.fillPaths?.length ?? 0) + (n.strokePaths?.length ?? 0) > 0));
    expect(vectors.length).toBeGreaterThan(0);

    // Trailing swap 4:57 → chevron-down 1:1605
    const trailing = item!.children
      .map((id) => doc.nodes[id])
      .find((n) => n?.name === "Icon Trailing");
    expect(trailing).toBeTruthy();
    expect(
      "componentId" in trailing! ? trailing.componentId : undefined
    ).toBe("1:1605");
  }, 120_000);
});

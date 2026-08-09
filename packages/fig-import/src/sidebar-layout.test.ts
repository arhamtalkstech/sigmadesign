/**
 * Regression: nested derivedSymbolData must not collapse sidebar menu rows
 * to icon-sized frames (18×18) with stacked labels.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importFigFile } from "./import.js";

const SAMPLE = resolve(import.meta.dirname, "../../../sample-figma-file.fig");

describe("sidebar layout after instance expansion", () => {
  it(
    "sidebar-7 menu items are full rows stacked vertically with labels",
    async () => {
      if (!existsSync(SAMPLE)) return;
      const doc = await importFigFile(readFileSync(SAMPLE));
      const sidebar = doc.nodes["1:11016"];
      expect(sidebar?.name).toBe("sidebar-7");

      // Find wide menu list under this sidebar
      let listId: string | null = null;
      const findList = (id: string) => {
        const n = doc.nodes[id];
        if (!n) return;
        if (
          n.name === "sidebar-menu-list" &&
          n.children.length >= 6 &&
          n.size.width >= 200
        ) {
          listId = id;
          return;
        }
        for (const c of n.children) {
          findList(c);
          if (listId) return;
        }
      };
      findList("1:11016");
      expect(listId).toBeTruthy();

      const list = doc.nodes[listId!]!;
      const items = list.children.map((id) => doc.nodes[id]!);
      expect(items.length).toBeGreaterThanOrEqual(6);

      // Full-width menu rows (not icon-sized 18×18)
      for (const item of items) {
        expect(item.size.width).toBeGreaterThan(100);
        expect(item.size.height).toBeGreaterThan(30);
      }

      // Distinct vertical stacking
      const ys = items.map((i) => Math.round(i.transform.m12));
      const uniqueYs = new Set(ys);
      expect(uniqueYs.size).toBe(items.length);

      // Spacing roughly one row (+ gap)
      const sorted = [...ys].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const dy = sorted[i]! - sorted[i - 1]!;
        expect(dy).toBeGreaterThan(30);
        expect(dy).toBeLessThan(60);
      }

      // Labels present for known nav items
      const labels = new Set<string>();
      const walkText = (id: string) => {
        const n = doc.nodes[id];
        if (!n) return;
        if (n.type === "TEXT" && "characters" in n && n.characters) {
          labels.add(n.characters);
        }
        for (const c of n.children) walkText(c);
      };
      walkText(listId!);
      for (const t of [
        "Admin",
        "Assignments",
        "Explore",
        "Create",
        "Teacher Academy",
        "Resources",
        "Setting",
      ]) {
        expect(labels.has(t), `missing label ${t}`).toBe(true);
      }
    },
    120_000
  );
});

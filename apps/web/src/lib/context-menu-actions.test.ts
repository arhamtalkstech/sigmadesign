/**
 * Drives shipped pure menu → document mutations (no store reimplementation).
 */
import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "@alteron/document-model";
import {
  applyContextMenuAction,
  CONTEXT_MENU_ITEMS,
  deleteNodes,
  duplicateNode,
  reorderSibling,
  toggleNodeVisibility,
} from "./context-menu-actions";

function docWithFrame() {
  const doc = createEmptyDocument("T");
  const pageId = doc.currentPageId!;
  const id = "n:1";
  doc.nodes[id] = {
    id,
    type: "RECTANGLE",
    name: "Rect",
    parentId: pageId,
    children: [],
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "PASS_THROUGH",
    transform: { m00: 1, m01: 0, m02: 10, m10: 0, m11: 1, m12: 20 },
    size: { width: 100, height: 50 },
    fills: [
      {
        type: "SOLID",
        color: { r: 1, g: 0, b: 0, a: 1 },
        opacity: 1,
        visible: true,
        blendMode: "NORMAL",
      },
    ],
    strokes: [],
    strokeWeight: 0,
    strokeAlign: "INSIDE",
    effects: [],
  };
  doc.pages = doc.pages.map((p) =>
    p.id === pageId ? { ...p, children: [id, "n:2"] } : p
  );
  doc.nodes["n:2"] = {
    ...doc.nodes[id]!,
    id: "n:2",
    name: "Rect 2",
    transform: { m00: 1, m01: 0, m02: 40, m10: 0, m11: 1, m12: 20 },
  };
  return { doc, id, pageId };
}

describe("context-menu-actions (shipped pure path)", () => {
  it("exports style/structure menu items required by criteria", () => {
    const ids = CONTEXT_MENU_ITEMS.map((i) => i.id);
    expect(ids).toContain("edit-properties");
    expect(ids).toContain("toggle-visibility");
    expect(
      ids.some((x) => x === "delete" || x === "duplicate" || x === "bring-to-front")
    ).toBe(true);
  });

  it("toggleNodeVisibility flips visible on real node", () => {
    const { doc, id } = docWithFrame();
    const next = toggleNodeVisibility(doc, id);
    expect(next.nodes[id]!.visible).toBe(false);
    const back = toggleNodeVisibility(next, id);
    expect(back.nodes[id]!.visible).toBe(true);
  });

  it("deleteNodes removes id from page children and nodes map", () => {
    const { doc, id, pageId } = docWithFrame();
    const next = deleteNodes(doc, [id]);
    expect(next.nodes[id]).toBeUndefined();
    const page = next.pages.find((p) => p.id === pageId)!;
    expect(page.children).not.toContain(id);
    expect(page.children).toContain("n:2");
  });

  it("reorderSibling bring front / send back mutates sibling order", () => {
    const { doc, id, pageId } = docWithFrame();
    const page = () => doc.pages.find((p) => p.id === pageId)!.children;
    expect(page()).toEqual(["n:1", "n:2"]);
    let next = reorderSibling(doc, id, "front");
    expect(next.pages.find((p) => p.id === pageId)!.children).toEqual([
      "n:2",
      "n:1",
    ]);
    next = reorderSibling(next, id, "back");
    expect(next.pages.find((p) => p.id === pageId)!.children[0]).toBe("n:1");
  });

  it("duplicateNode creates sibling with offset and new id", () => {
    const { doc, id, pageId } = docWithFrame();
    let n = 0;
    const { doc: next, newId } = duplicateNode(doc, id, () => `copy:${++n}`);
    expect(newId).toBe("copy:1");
    expect(next.nodes[newId!]!.name).toMatch(/copy/i);
    expect(next.nodes[newId!]!.transform.m02).toBe(
      doc.nodes[id]!.transform.m02 + 16
    );
    const children = next.pages.find((p) => p.id === pageId)!.children;
    expect(children).toContain(newId!);
  });

  it("applyContextMenuAction edit-properties focuses target selection", () => {
    const { doc, id } = docWithFrame();
    const r = applyContextMenuAction(doc, [], id, "edit-properties");
    expect(r.selection).toEqual([id]);
    expect(r.focusProperties).toBe(true);
  });

  it("applyContextMenuAction delete clears selection", () => {
    const { doc, id } = docWithFrame();
    const r = applyContextMenuAction(doc, [id], id, "delete");
    expect(r.selection).toEqual([]);
    expect(r.doc.nodes[id]).toBeUndefined();
  });
});

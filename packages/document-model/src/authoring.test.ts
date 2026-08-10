import { describe, expect, it } from "vitest";
import {
  alignNodes,
  applyBooleanOperation,
  applyColorVariableAsFill,
  applyFillStyle,
  createColorVariable,
  createComponentFromNode,
  createEmptyDocument,
  createFillStyle,
  createInstanceOf,
  createShapeInDocument,
  createVectorFromPoints,
  placeImageAsset,
  resizeNodeByHandle,
  rotateNode,
  setAutoLayout,
  snapTranslation,
  pointsToPathD,
  computeAbsoluteTransforms,
} from "./index.js";

describe("create shapes", () => {
  it("creates rectangle on page", () => {
    let doc = createEmptyDocument("T");
    const r = createShapeInDocument(doc, "RECTANGLE", 10, 20, 100, 50);
    doc = r.doc;
    expect(r.id).toBeTruthy();
    expect(doc.nodes[r.id!]?.type).toBe("RECTANGLE");
    expect(doc.pages[0]!.children).toContain(r.id);
    expect(doc.nodes[r.id!]!.size).toEqual({ width: 100, height: 50 });
  });

  it("creates text node with characters", () => {
    let doc = createEmptyDocument("T");
    const r = createShapeInDocument(doc, "TEXT", 0, 0, 200, 24);
    doc = r.doc;
    const n = doc.nodes[r.id!];
    expect(n?.type).toBe("TEXT");
    expect(n && "characters" in n && n.characters).toBe("Text");
  });
});

describe("geometry", () => {
  it("resizes SE handle", () => {
    let doc = createEmptyDocument("T");
    const r = createShapeInDocument(doc, "RECTANGLE", 0, 0, 100, 100);
    doc = r.doc;
    computeAbsoluteTransforms(doc, doc.currentPageId!);
    doc = resizeNodeByHandle(doc, r.id, "se", 150, 200);
    const n = doc.nodes[r.id]!;
    expect(n.size.width).toBe(150);
    expect(n.size.height).toBe(200);
  });

  it("rotates node", () => {
    let doc = createEmptyDocument("T");
    const r = createShapeInDocument(doc, "RECTANGLE", 0, 0, 100, 50);
    doc = r.doc;
    doc = rotateNode(doc, r.id, 90);
    expect(doc.nodes[r.id]!.rotation).toBe(90);
    expect(Math.abs(doc.nodes[r.id]!.transform.m00)).toBeLessThan(0.01);
  });

  it("aligns left", () => {
    let doc = createEmptyDocument("T");
    const a = createShapeInDocument(doc, "RECTANGLE", 50, 0, 20, 20);
    doc = a.doc;
    const b = createShapeInDocument(doc, "RECTANGLE", 100, 40, 20, 20);
    doc = b.doc;
    computeAbsoluteTransforms(doc, doc.currentPageId!);
    doc = alignNodes(doc, [a.id, b.id], "left");
    expect(doc.nodes[a.id]!.transform.m02).toBe(
      doc.nodes[b.id]!.transform.m02
    );
  });

  it("snaps translation near sibling", () => {
    let doc = createEmptyDocument("T");
    const a = createShapeInDocument(doc, "RECTANGLE", 0, 0, 50, 50);
    doc = a.doc;
    const b = createShapeInDocument(doc, "RECTANGLE", 100, 0, 50, 50);
    doc = b.doc;
    computeAbsoluteTransforms(doc, doc.currentPageId!);
    const snap = snapTranslation(doc, [b.id], -48, 0, 5);
    expect(Math.abs(snap.x - -50)).toBeLessThan(1);
  });
});

describe("vector pen", () => {
  it("builds path d and vector node", () => {
    expect(pointsToPathD([{ x: 0, y: 0 }, { x: 10, y: 10 }], false)).toBe(
      "M 0 0 L 10 10"
    );
    let doc = createEmptyDocument("T");
    const r = createVectorFromPoints(doc, [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
    ]);
    doc = r.doc;
    expect(doc.nodes[r.id]?.type).toBe("VECTOR");
    expect(doc.nodes[r.id]?.strokePaths?.[0]?.d).toContain("M ");
  });
});

describe("boolean", () => {
  it("unions two rectangles under BOOLEAN_OPERATION", () => {
    let doc = createEmptyDocument("T");
    const a = createShapeInDocument(doc, "RECTANGLE", 0, 0, 40, 40);
    doc = a.doc;
    const b = createShapeInDocument(doc, "RECTANGLE", 20, 20, 40, 40);
    doc = b.doc;
    computeAbsoluteTransforms(doc, doc.currentPageId!);
    const r = applyBooleanOperation(doc, [a.id, b.id], "UNION");
    doc = r.doc;
    expect(doc.nodes[r.id]?.type).toBe("BOOLEAN_OPERATION");
    expect(doc.nodes[r.id]?.children).toEqual([a.id, b.id]);
    expect(doc.nodes[r.id]?.booleanOperation).toBe("UNION");
  });
});

describe("auto layout managed", () => {
  it("reflows horizontal children with gap", () => {
    let doc = createEmptyDocument("T");
    const frame = createShapeInDocument(doc, "FRAME", 0, 0, 400, 100);
    doc = frame.doc;
    const c1 = createShapeInDocument(doc, "RECTANGLE", 0, 0, 40, 40, {
      parentId: frame.id,
    });
    doc = c1.doc;
    const c2 = createShapeInDocument(doc, "RECTANGLE", 0, 0, 40, 40, {
      parentId: frame.id,
    });
    doc = c2.doc;
    doc = setAutoLayout(doc, frame.id, {
      mode: "HORIZONTAL",
      gap: 10,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      primaryAlign: "MIN",
    });
    expect(doc.nodes[c1.id]!.transform.m02).toBe(0);
    expect(doc.nodes[c2.id]!.transform.m02).toBe(50);
  });
});

describe("components", () => {
  it("creates component and instance", () => {
    let doc = createEmptyDocument("T");
    const r = createShapeInDocument(doc, "RECTANGLE", 0, 0, 80, 80, {
      name: "Card",
    });
    doc = r.doc;
    const cmp = createComponentFromNode(doc, r.id);
    doc = cmp.doc;
    expect(doc.nodes[cmp.componentId]?.type).toBe("COMPONENT");
    expect(doc.components[cmp.componentId]).toBeTruthy();
    const inst = createInstanceOf(doc, cmp.componentId);
    doc = inst.doc;
    expect(doc.nodes[inst.instanceId]?.type).toBe("INSTANCE");
  });
});

describe("styles and variables", () => {
  it("creates fill style and applies", () => {
    let doc = createEmptyDocument("T");
    const r = createShapeInDocument(doc, "RECTANGLE", 0, 0, 10, 10);
    doc = r.doc;
    const s = createFillStyle(doc, "Brand", [
      {
        type: "SOLID",
        color: { r: 1, g: 0, b: 0, a: 1 },
        opacity: 1,
        visible: true,
        blendMode: "NORMAL",
      },
    ]);
    doc = s.doc;
    doc = applyFillStyle(doc, r.id, s.styleId);
    expect(doc.nodes[r.id]!.fillStyleId).toBe(s.styleId);
    expect(doc.nodes[r.id]!.fills[0]).toMatchObject({ type: "SOLID" });
  });

  it("creates color variable and applies as fill", () => {
    let doc = createEmptyDocument("T");
    const r = createShapeInDocument(doc, "RECTANGLE", 0, 0, 10, 10);
    doc = r.doc;
    const v = createColorVariable(doc, "Primary", {
      r: 0,
      g: 0.5,
      b: 1,
      a: 1,
    });
    doc = v.doc;
    doc = applyColorVariableAsFill(doc, r.id, v.variableId);
    const fill = doc.nodes[r.id]!.fills[0] as { type: string; color: { b: number } };
    expect(fill.type).toBe("SOLID");
    expect(fill.color.b).toBe(1);
  });
});

describe("image place", () => {
  it("embeds asset and image fill", () => {
    let doc = createEmptyDocument("T");
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const r = placeImageAsset(doc, dataUrl, "image/png", 0, 0, 100, 100);
    doc = r.doc;
    expect(doc.assets[r.hash]?.dataUrl).toBe(dataUrl);
    expect(doc.nodes[r.id]!.fills[0]).toMatchObject({
      type: "IMAGE",
      imageHash: r.hash,
    });
  });
});

describe("import fidelity guard", () => {
  it("createEmptyDocument still has no managed layout by default", () => {
    const doc = createEmptyDocument("X");
    expect(doc.styles).toEqual({});
    expect(doc.pages[0]?.children).toEqual([]);
  });
});

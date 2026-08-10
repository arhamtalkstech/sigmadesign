/**
 * Gating tests for goal: comments, variables, booleans, constraints, vector edit.
 * Drive shipped document-model APIs only.
 */
import { describe, expect, it } from "vitest";
import {
  addVariableMode,
  applyBooleanOperation,
  applyColorVariableAsFill,
  booleanAabb,
  commentsFromImportPayload,
  createColorVariable,
  createComment,
  createEmptyDocument,
  createFloatVariable,
  createShapeInDocument,
  createVectorFromPoints,
  deleteVectorPoint,
  getVectorPoints,
  insertVectorPoint,
  mergeImportedComments,
  moveVectorPoint,
  resolveComment,
  resolveVariableColor,
  resolveVariableFloat,
  applyNodePatch,
  resizeParentWithConstraints,
  setActiveMode,
  setVariableModeValue,
  setVectorClosed,
  updateCommentMessage,
  computeAbsoluteTransforms,
} from "./index.js";

describe("comments", () => {
  it("creates, updates, and resolves comments", () => {
    let doc = createEmptyDocument("C");
    const r = createComment(doc, 12, 34, "Hello pin");
    doc = r.doc;
    expect(doc.comments?.[r.commentId]?.message).toBe("Hello pin");
    expect(doc.comments?.[r.commentId]?.x).toBe(12);
    doc = updateCommentMessage(doc, r.commentId, "Updated");
    expect(doc.comments?.[r.commentId]?.message).toBe("Updated");
    doc = resolveComment(doc, r.commentId, true);
    expect(doc.comments?.[r.commentId]?.resolved).toBe(true);
  });

  it("loads comments from import payload shape", () => {
    const loaded = commentsFromImportPayload({
      comments: [
        {
          id: "c1",
          message: "From fig",
          x: 5,
          y: 6,
          author: "Ada",
          resolved: false,
        },
      ],
    });
    expect(loaded.c1?.message).toBe("From fig");
    let doc = createEmptyDocument("I");
    doc = mergeImportedComments(doc, loaded);
    expect(doc.comments?.c1?.author).toBe("Ada");
  });
});

describe("variables multi-mode", () => {
  it("binds fill, switches mode, re-resolves color", () => {
    let doc = createEmptyDocument("V");
    const shape = createShapeInDocument(doc, "RECTANGLE", 0, 0, 40, 40);
    doc = shape.doc;
    const v = createColorVariable(doc, "Brand", {
      r: 1,
      g: 0,
      b: 0,
      a: 1,
    });
    doc = v.doc;
    const mode = addVariableMode(doc, v.collectionId, "Dark");
    doc = mode.doc;
    doc = setVariableModeValue(doc, v.variableId, mode.modeId, {
      r: 0,
      g: 0,
      b: 1,
      a: 1,
    });
    doc = applyColorVariableAsFill(doc, shape.id, v.variableId);
    expect(doc.nodes[shape.id]!.fillVariableId).toBe(v.variableId);
    const red = resolveVariableColor(doc, v.variableId);
    expect(red?.r).toBe(1);
    doc = setActiveMode(doc, v.collectionId, mode.modeId);
    const blue = resolveVariableColor(doc, v.variableId);
    expect(blue?.b).toBe(1);
    // Bound node fills rebind on mode switch
    const fill = doc.nodes[shape.id]!.fills[0] as {
      type: string;
      color: { b: number };
    };
    expect(fill.color.b).toBe(1);
  });

  it("creates float variable", () => {
    let doc = createEmptyDocument("F");
    const v = createFloatVariable(doc, "Opacity", 0.5);
    doc = v.doc;
    expect(resolveVariableFloat(doc, v.variableId)).toBe(0.5);
  });
});

describe("boolean aabb", () => {
  it("intersects two rects", () => {
    const r = booleanAabb(
      [
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 50, y: 50, w: 100, h: 100 },
      ],
      "INTERSECT"
    );
    expect(r).toEqual({ x: 50, y: 50, w: 50, h: 50 });
  });

  it("applyBooleanOperation produces BOOLEAN_OPERATION with geometry", () => {
    let doc = createEmptyDocument("B");
    const a = createShapeInDocument(doc, "RECTANGLE", 0, 0, 80, 80);
    doc = a.doc;
    const b = createShapeInDocument(doc, "RECTANGLE", 40, 40, 80, 80);
    doc = b.doc;
    computeAbsoluteTransforms(doc, doc.currentPageId!);
    const r = applyBooleanOperation(doc, [a.id, b.id], "UNION");
    doc = r.doc;
    expect(doc.nodes[r.id]?.type).toBe("BOOLEAN_OPERATION");
    expect(doc.nodes[r.id]?.fillPaths?.length).toBeGreaterThan(0);
  });
});

describe("constraints on parent resize", () => {
  it("MAX horizontal child moves when parent grows", () => {
    let doc = createEmptyDocument("K");
    const frame = createShapeInDocument(doc, "FRAME", 0, 0, 200, 100);
    doc = frame.doc;
    const child = createShapeInDocument(doc, "RECTANGLE", 150, 10, 40, 40, {
      parentId: frame.id,
    });
    doc = child.doc;
    // pin right
    doc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [child.id]: {
          ...doc.nodes[child.id]!,
          constraints: { horizontal: "MAX", vertical: "MIN" },
        },
      },
    };
    doc = resizeParentWithConstraints(
      doc,
      frame.id,
      { width: 300, height: 100 },
      { width: 200, height: 100 }
    );
    expect(doc.nodes[child.id]!.transform.m02).toBe(250);
  });

  it("STRETCH grows child width with parent", () => {
    let doc = createEmptyDocument("K2");
    const frame = createShapeInDocument(doc, "FRAME", 0, 0, 200, 100);
    doc = frame.doc;
    const child = createShapeInDocument(doc, "RECTANGLE", 10, 10, 180, 20, {
      parentId: frame.id,
    });
    doc = child.doc;
    doc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [child.id]: {
          ...doc.nodes[child.id]!,
          constraints: { horizontal: "STRETCH", vertical: "MIN" },
        },
      },
    };
    doc = resizeParentWithConstraints(
      doc,
      frame.id,
      { width: 300, height: 100 },
      { width: 200, height: 100 }
    );
    expect(doc.nodes[child.id]!.size.width).toBe(280);
  });

  it("applyNodePatch size (Design panel path) reflows MAX children", () => {
    // Same entry used by store.patchSelected for W/H fields
    let doc = createEmptyDocument("K3");
    const frame = createShapeInDocument(doc, "FRAME", 0, 0, 200, 100);
    doc = frame.doc;
    const child = createShapeInDocument(doc, "RECTANGLE", 150, 10, 40, 40, {
      parentId: frame.id,
    });
    doc = child.doc;
    doc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [child.id]: {
          ...doc.nodes[child.id]!,
          constraints: { horizontal: "MAX", vertical: "MIN" },
        },
      },
    };
    doc = applyNodePatch(doc, frame.id, {
      size: { width: 300, height: 100 },
    });
    expect(doc.nodes[frame.id]!.size.width).toBe(300);
    expect(doc.nodes[child.id]!.transform.m02).toBe(250);
  });
});

describe("vector node edit", () => {
  it("move, insert, delete, close points", () => {
    let doc = createEmptyDocument("Vec");
    const v = createVectorFromPoints(doc, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
    doc = v.doc;
    let pts = getVectorPoints(doc, v.id);
    expect(pts.points.length).toBe(3);
    expect(pts.closed).toBe(false);

    doc = moveVectorPoint(doc, v.id, 1, { x: 80, y: 0 });
    pts = getVectorPoints(doc, v.id);
    expect(pts.points[1]!.x).toBe(80);

    doc = insertVectorPoint(doc, v.id, 1, { x: 50, y: 25 });
    pts = getVectorPoints(doc, v.id);
    expect(pts.points.length).toBe(4);

    doc = deleteVectorPoint(doc, v.id, 1);
    pts = getVectorPoints(doc, v.id);
    expect(pts.points.length).toBe(3);

    doc = setVectorClosed(doc, v.id, true);
    pts = getVectorPoints(doc, v.id);
    expect(pts.closed).toBe(true);
  });
});

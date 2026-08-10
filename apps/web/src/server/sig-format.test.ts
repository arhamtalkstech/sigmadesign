/**
 * Gating: .sig ADM writeback encode → decode preserves edits (shipped helpers).
 */
import { describe, expect, it } from "vitest";
import {
  createComment,
  createEmptyDocument,
  createShapeInDocument,
} from "@alteron/document-model";
import {
  encodeAdmSig,
  isAdmSigFile,
  readAdmSigDocument,
  writeAdmSigDocument,
} from "./sig-format";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("sig ADM writeback", () => {
  it("round-trips nodes, comments, and variables through encode/decode", () => {
    let doc = createEmptyDocument("Writeback");
    const shape = createShapeInDocument(doc, "RECTANGLE", 10, 20, 100, 80);
    doc = shape.doc;
    const c = createComment(doc, 1, 2, "Pinned note");
    doc = c.doc;
    doc = {
      ...doc,
      variables: {
        v1: {
          id: "v1",
          name: "Primary",
          resolvedType: "COLOR",
          defaultModeId: "mode_default",
          valuesByMode: {
            mode_default: { r: 0.1, g: 0.2, b: 0.9, a: 1 },
          },
        },
      },
    };

    const bytes = encodeAdmSig(doc);
    expect(isAdmSigFile(bytes)).toBe(true);
    const restored = readAdmSigDocument(bytes, "fallback");
    expect(restored.nodes[shape.id]?.size.width).toBe(100);
    expect(restored.comments?.[c.commentId]?.message).toBe("Pinned note");
    expect(restored.variables?.v1?.name).toBe("Primary");
  });

  it("writeAdmSigDocument then read file restores mutation", () => {
    const dir = mkdtempSync(join(tmpdir(), "sig-wb-"));
    try {
      let doc = createEmptyDocument("Disk");
      const shape = createShapeInDocument(doc, "ELLIPSE", 0, 0, 50, 50);
      doc = shape.doc;
      const path = join(dir, "file.sig");
      writeAdmSigDocument(path, doc);
      const bytes = readFileSync(path);
      const restored = readAdmSigDocument(bytes, "x");
      expect(restored.nodes[shape.id]?.type).toBe("ELLIPSE");
      expect(Object.keys(restored.nodes).length).toBe(
        Object.keys(doc.nodes).length
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * Place images into the document as rectangle fills with embedded data URLs.
 */
import type { AlteronDocument, NodeId } from "./types.js";
import { createShapeInDocument } from "./create-node.js";
import { updateNode } from "./tree.js";

/** Simple FNV-1a style hash for asset keys (not crypto). */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + input.length.toString(16);
}

export function placeImageAsset(
  doc: AlteronDocument,
  dataUrl: string,
  mimeType: string,
  worldX: number,
  worldY: number,
  width: number,
  height: number,
  options?: { name?: string }
): { doc: AlteronDocument; id: NodeId; hash: string } {
  const hash = hashString(dataUrl.slice(0, 2048) + dataUrl.length);
  const byteLength = Math.floor((dataUrl.length * 3) / 4);
  let next: AlteronDocument = {
    ...doc,
    assets: {
      ...doc.assets,
      [hash]: {
        hash,
        mimeType,
        dataUrl,
        byteLength,
      },
    },
  };

  const { doc: withNode, id } = createShapeInDocument(
    next,
    "RECTANGLE",
    worldX,
    worldY,
    width,
    height,
    { name: options?.name ?? "Image" }
  );
  if (!id) return { doc: next, id: "", hash };

  next = updateNode(withNode, id, {
    fills: [
      {
        type: "IMAGE",
        imageHash: hash,
        scaleMode: "FILL",
        opacity: 1,
        visible: true,
        blendMode: "NORMAL",
      },
    ],
  });
  return { doc: next, id, hash };
}

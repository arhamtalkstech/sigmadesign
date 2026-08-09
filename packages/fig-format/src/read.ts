import { decodeFigKiwiBuffer, decodeMessage } from "./archive.js";
import { unpackFigFile } from "./zip.js";
import type { DecodedFigFile, FigMessage } from "./types.js";

/**
 * Read a full .fig file (ZIP) or bare canvas.fig into a decoded message.
 */
export async function readFigFile(
  input: ArrayBuffer | Uint8Array
): Promise<DecodedFigFile> {
  const unpacked = await unpackFigFile(input);
  const decoded = decodeFigKiwiBuffer(unpacked.canvas);
  const message = decodeMessage(
    decoded.compiledSchema,
    decoded.dataBytes
  ) as FigMessage;

  return {
    header: decoded.header,
    meta: unpacked.meta,
    message,
    schemaBytes: decoded.schemaBytes,
    compiledSchema: decoded.compiledSchema,
    images: unpacked.images,
    thumbnail: unpacked.thumbnail,
  };
}

export function guidToString(guid: {
  sessionID: number;
  localID: number;
}): string {
  return `${guid.sessionID}:${guid.localID}`;
}

export function parseGuid(id: string): { sessionID: number; localID: number } {
  const [s, l] = id.split(":");
  return { sessionID: Number(s), localID: Number(l) };
}

/** Summarize node type histogram for debugging / tests */
export function summarizeMessage(message: FigMessage): {
  nodeCount: number;
  blobCount: number;
  typeCounts: Record<string, number>;
} {
  const nodes = message.nodeChanges ?? [];
  const typeCounts: Record<string, number> = {};
  for (const n of nodes) {
    const t = n.type ?? "unknown";
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  return {
    nodeCount: nodes.length,
    blobCount: message.blobs?.length ?? 0,
    typeCounts,
  };
}

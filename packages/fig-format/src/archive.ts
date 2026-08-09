import { inflateRaw, inflate } from "pako";
import { decompress as zstdDecompress } from "fzstd";
import {
  decodeBinarySchema,
  compileSchema,
  type Schema,
} from "kiwi-schema";

export const FIG_KIWI_PRELUDE = "fig-kiwi";

export interface ParsedChunks {
  header: { prelude: string; version: number };
  schemaCompressed: Uint8Array;
  dataCompressed: Uint8Array;
}

/**
 * Parse a raw canvas.fig / fig-kiwi buffer into compressed chunks.
 * Layout: [8 prelude][4 version LE][4 schemaLen][schema][4 dataLen][data]
 */
export function parseFigKiwiArchive(buffer: Uint8Array): ParsedChunks {
  if (buffer.length < 16) {
    throw new Error("fig-kiwi buffer too small");
  }

  const prelude = String.fromCharCode(...buffer.subarray(0, 8));
  if (prelude !== FIG_KIWI_PRELUDE && !prelude.startsWith("fig-")) {
    throw new Error(`Unknown fig prelude: ${JSON.stringify(prelude)}`);
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 8;
  const version = view.getUint32(offset, true);
  offset += 4;

  const schemaLen = view.getUint32(offset, true);
  offset += 4;
  if (offset + schemaLen > buffer.length) {
    throw new Error(`Schema chunk overflows buffer (${schemaLen} bytes)`);
  }
  const schemaCompressed = buffer.subarray(offset, offset + schemaLen);
  offset += schemaLen;

  if (offset + 4 > buffer.length) {
    throw new Error("Missing data chunk length");
  }
  const dataLen = view.getUint32(offset, true);
  offset += 4;
  if (offset + dataLen > buffer.length) {
    throw new Error(`Data chunk overflows buffer (${dataLen} bytes)`);
  }
  const dataCompressed = buffer.subarray(offset, offset + dataLen);

  return {
    header: { prelude, version },
    schemaCompressed,
    dataCompressed,
  };
}

/** Decompress schema chunk (raw deflate / zlib-raw) */
export function decompressSchema(compressed: Uint8Array): Uint8Array {
  try {
    return inflateRaw(compressed);
  } catch {
    // some older files may use zlib wrapper
    return inflate(compressed);
  }
}

/** Decompress data chunk — modern files use zstd; fall back to deflate */
export function decompressData(compressed: Uint8Array): Uint8Array {
  // zstd magic: 0x28 0xB5 0x2F 0xFD
  if (
    compressed.length >= 4 &&
    compressed[0] === 0x28 &&
    compressed[1] === 0xb5 &&
    compressed[2] === 0x2f &&
    compressed[3] === 0xfd
  ) {
    return zstdDecompress(compressed);
  }

  try {
    return zstdDecompress(compressed);
  } catch {
    try {
      return inflateRaw(compressed);
    } catch {
      return inflate(compressed);
    }
  }
}

export interface DecodedArchive {
  header: { prelude: string; version: number };
  schemaBytes: Uint8Array;
  dataBytes: Uint8Array;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compiledSchema: any;
  schema: Schema;
}

export function decodeFigKiwiBuffer(buffer: Uint8Array): DecodedArchive {
  const chunks = parseFigKiwiArchive(buffer);
  const schemaBytes = decompressSchema(chunks.schemaCompressed);
  const dataBytes = decompressData(chunks.dataCompressed);
  const schema = decodeBinarySchema(schemaBytes);
  const compiledSchema = compileSchema(schema);

  return {
    header: chunks.header,
    schemaBytes,
    dataBytes,
    compiledSchema,
    schema,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeMessage(compiledSchema: any, dataBytes: Uint8Array): any {
  if (typeof compiledSchema.decodeMessage === "function") {
    return compiledSchema.decodeMessage(dataBytes);
  }
  if (typeof compiledSchema.decodeNodeChanges === "function") {
    return compiledSchema.decodeNodeChanges(dataBytes);
  }
  throw new Error("Compiled schema has no decodeMessage / decodeNodeChanges");
}

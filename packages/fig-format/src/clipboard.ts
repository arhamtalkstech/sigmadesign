import { compileSchema, decodeBinarySchema } from "kiwi-schema";
import {
  decodeFigKiwiBuffer,
  decodeMessage,
  decompressData,
} from "./archive.js";
import { extractImagesFromMessage } from "./images.js";
import type { ClipboardFigPayload, FigMessage } from "./types.js";
import { unpackFigFile } from "./zip.js";

const META_START = "<!--(figmeta)";
const META_END = "(/figmeta)-->";
const FIGMA_START = "<!--(figma)";
const FIGMA_END = "(/figma)-->";

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export function extractFigmaClipboardHtml(html: string): {
  meta: Record<string, unknown>;
  figmaBytes: Uint8Array;
} | null {
  const msi = html.indexOf(META_START);
  const mei = html.indexOf(META_END);
  const fsi = html.indexOf(FIGMA_START);
  const fei = html.indexOf(FIGMA_END);
  if (msi === -1 || fsi === -1 || mei === -1 || fei === -1) return null;

  const metaB64 = html.slice(msi + META_START.length, mei).trim();
  const figB64 = html.slice(fsi + FIGMA_START.length, fei).trim();
  const metaStr =
    typeof Buffer !== "undefined"
      ? Buffer.from(metaB64, "base64").toString("utf8")
      : new TextDecoder().decode(base64ToBytes(metaB64));

  return {
    meta: JSON.parse(metaStr) as Record<string, unknown>,
    figmaBytes: base64ToBytes(figB64),
  };
}

/**
 * Decode Figma clipboard HTML.
 * Clipboard payloads often omit the schema; pass `schemaBytes` from a recently
 * imported .fig file (or a cached schema).
 */
export function decodeFigmaClipboard(
  html: string,
  schemaBytes?: Uint8Array
): ClipboardFigPayload {
  const extracted = extractFigmaClipboardHtml(html);
  if (!extracted) {
    throw new Error("HTML does not contain Figma clipboard markers");
  }

  const { meta, figmaBytes } = extracted;

  // Full fig-kiwi archive in clipboard
  // (ZIP clipboards are handled by decodeFigmaClipboardAsync)
  if (
    figmaBytes.length >= 8 &&
    String.fromCharCode(...figmaBytes.subarray(0, 8)) === "fig-kiwi"
  ) {
    const decoded = decodeFigKiwiBuffer(figmaBytes);
    const message = decodeMessage(
      decoded.compiledSchema,
      decoded.dataBytes
    ) as FigMessage;
    const images = extractImagesFromMessage(message);
    return {
      meta,
      message,
      schemaBytes: decoded.schemaBytes,
      images,
    };
  }

  // Data-only blob: need external schema
  if (!schemaBytes) {
    throw new Error(
      "Clipboard payload has no embedded schema. Import a .fig file first to cache schema, then paste."
    );
  }

  const compiled = compileSchema(decodeBinarySchema(schemaBytes));

  // may still be compressed
  let dataBytes = figmaBytes;
  try {
    dataBytes = decompressData(figmaBytes);
  } catch {
    // already raw
  }

  const message = decodeMessage(compiled, dataBytes) as FigMessage;
  const images = extractImagesFromMessage(message);
  return { meta, message, schemaBytes, images };
}

/**
 * Async clipboard decode that also accepts a full .fig ZIP payload (with images/).
 */
export async function decodeFigmaClipboardAsync(
  html: string,
  schemaBytes?: Uint8Array
): Promise<ClipboardFigPayload> {
  const extracted = extractFigmaClipboardHtml(html);
  if (!extracted) {
    throw new Error("HTML does not contain Figma clipboard markers");
  }
  const { meta, figmaBytes } = extracted;

  // Full .fig ZIP in clipboard
  if (figmaBytes.length >= 4 && figmaBytes[0] === 0x50 && figmaBytes[1] === 0x4b) {
    const unpacked = await unpackFigFile(figmaBytes);
    const decoded = decodeFigKiwiBuffer(unpacked.canvas);
    const message = decodeMessage(
      decoded.compiledSchema,
      decoded.dataBytes
    ) as FigMessage;
    const fromBlobs = extractImagesFromMessage(message);
    const images = new Map(unpacked.images);
    for (const [k, v] of fromBlobs) {
      if (!images.has(k)) images.set(k, v);
    }
    return {
      meta,
      message,
      schemaBytes: decoded.schemaBytes,
      images,
    };
  }

  return decodeFigmaClipboard(html, schemaBytes);
}

export function composeFigmaClipboardHtml(
  meta: Record<string, unknown>,
  figmaBytes: Uint8Array
): string {
  const metaStr = bytesToBase64(
    new TextEncoder().encode(JSON.stringify(meta))
  );
  const figStr = bytesToBase64(figmaBytes);
  return `<meta charset="utf-8" /><span data-metadata="<!--(figmeta)${metaStr}(/figmeta)-->"></span><span data-buffer="<!--(figma)${figStr}(/figma)-->"></span><span style="white-space:pre-wrap"></span>`;
}

export function isFigmaClipboardHtml(html: string): boolean {
  return html.includes(FIGMA_START) && html.includes(META_START);
}

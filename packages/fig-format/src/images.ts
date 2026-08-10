/**
 * Image extraction helpers for .fig archives and clipboard payloads.
 *
 * Figma names image assets by SHA-1 of the raw bytes (hex). Full .fig ZIPs store
 * them under `images/<sha1>`. Clipboard HTML usually only carries the kiwi
 * scene graph — image bytes are often omitted — but when present they appear as
 * image-magic blobs whose SHA-1 matches fill `image.hash`.
 */

import type { FigMessage } from "./types.js";

export function isImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return true;
  }
  // WEBP (RIFF....WEBP)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

function toUint8(bytes: unknown): Uint8Array | null {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (Array.isArray(bytes)) return new Uint8Array(bytes);
  return null;
}

/**
 * SHA-1 hex digest — pure JS so it works in the browser bundle (no node:crypto).
 * Figma image keys are SHA-1 of the raw file bytes.
 */
export function sha1Hex(data: Uint8Array): string {
  const ml = data.length;
  const bitHi = Math.floor(ml / 0x20000000); // ml * 8 >> 32
  const bitLo = (ml << 3) >>> 0;

  // pad: data || 0x80 || zeros || 64-bit big-endian length
  const padLen = (ml + 9 + 63) & ~63;
  const buf = new Uint8Array(padLen);
  buf.set(data);
  buf[ml] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, bitHi, false);
  view.setUint32(padLen - 4, bitLo, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89 | 0;
  let h2 = 0x98badcfe | 0;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0 | 0;

  const w = new Int32Array(80);
  for (let i = 0; i < padLen; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getInt32(i + j * 4, false);
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3]! ^ w[j - 8]! ^ w[j - 14]! ^ w[j - 16]!;
      w[j] = (x << 1) | (x >>> 31);
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number;
      let k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + (w[j] as number)) | 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) | 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0 >>> 0, false);
  ov.setUint32(4, h1 >>> 0, false);
  ov.setUint32(8, h2 >>> 0, false);
  ov.setUint32(12, h3 >>> 0, false);
  ov.setUint32(16, h4 >>> 0, false);
  let hex = "";
  for (let i = 0; i < 20; i++) hex += out[i]!.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Scan message blobs for PNG/JPEG/GIF/WEBP payloads and index by content SHA-1.
 */
export function extractImagesFromMessage(
  message: FigMessage
): Map<string, Uint8Array> {
  const images = new Map<string, Uint8Array>();
  const blobs = message.blobs ?? [];
  for (const blob of blobs) {
    const bytes = toUint8(blob?.bytes);
    if (!bytes || !isImageBytes(bytes)) continue;
    // Copy so we don't retain the whole message buffer via a subarray view
    const copy = bytes.slice();
    const hash = sha1Hex(copy);
    if (!images.has(hash)) images.set(hash, copy);
  }
  return images;
}

/**
 * Collect image hash hex strings referenced by IMAGE fills in the message.
 * Used to report missing assets after paste.
 */
export function collectReferencedImageHashes(message: FigMessage): Set<string> {
  const hashes = new Set<string>();
  for (const n of message.nodeChanges ?? []) {
    const paints = (n as { fillPaints?: unknown[] }).fillPaints ?? [];
    for (const raw of paints) {
      const p = raw as {
        type?: string | number;
        image?: { hash?: unknown; name?: string };
      };
      if (p.type !== "IMAGE" && p.type !== 5) continue;
      const img = p.image;
      if (!img) continue;
      if (typeof img.hash === "string" && img.hash.length >= 32) {
        hashes.add(img.hash.toLowerCase());
      } else {
        const u = toUint8(img.hash);
        if (u && u.length >= 16) {
          let hex = "";
          for (let i = 0; i < u.length; i++) {
            hex += u[i]!.toString(16).padStart(2, "0");
          }
          hashes.add(hex);
        }
      }
      // Some paints store the hex on `name` when hash is binary
      if (typeof img.name === "string" && /^[0-9a-f]{32,40}$/i.test(img.name)) {
        hashes.add(img.name.toLowerCase());
      }
    }
  }
  return hashes;
}

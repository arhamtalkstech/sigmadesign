import JSZip from "jszip";
import type { FigMeta } from "./types.js";

export interface UnpackedFigZip {
  canvas: Uint8Array;
  meta: FigMeta;
  thumbnail?: Uint8Array;
  images: Map<string, Uint8Array>;
}

/**
 * Unpack a .fig file (ZIP) into canvas.fig + meta + images.
 * Also accepts a bare canvas.fig / fig-kiwi buffer.
 */
export async function unpackFigFile(
  input: ArrayBuffer | Uint8Array
): Promise<UnpackedFigZip> {
  const bytes =
    input instanceof Uint8Array ? input : new Uint8Array(input);

  // Bare fig-kiwi buffer
  if (
    bytes.length >= 8 &&
    String.fromCharCode(...bytes.subarray(0, 8)) === "fig-kiwi"
  ) {
    return {
      canvas: bytes,
      meta: {},
      images: new Map(),
    };
  }

  // ZIP signature PK
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(bytes);
    const canvasFile = zip.file("canvas.fig");
    if (!canvasFile) {
      throw new Error(".fig archive missing canvas.fig");
    }
    const canvas = new Uint8Array(await canvasFile.async("uint8array"));

    let meta: FigMeta = {};
    const metaFile = zip.file("meta.json");
    if (metaFile) {
      meta = JSON.parse(await metaFile.async("string")) as FigMeta;
    }

    let thumbnail: Uint8Array | undefined;
    const thumbFile = zip.file("thumbnail.png");
    if (thumbFile) {
      thumbnail = new Uint8Array(await thumbFile.async("uint8array"));
    }

    const images = new Map<string, Uint8Array>();
    const imageFiles = Object.keys(zip.files).filter(
      (p) => p.startsWith("images/") && !zip.files[p].dir
    );
    for (const path of imageFiles) {
      const hash = path.slice("images/".length);
      const file = zip.file(path);
      if (file && hash) {
        images.set(hash, new Uint8Array(await file.async("uint8array")));
      }
    }

    return { canvas, meta, thumbnail, images };
  }

  throw new Error(
    "Unrecognized input: expected .fig ZIP or fig-kiwi canvas buffer"
  );
}

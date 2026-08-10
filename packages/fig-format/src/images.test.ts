import { describe, expect, it } from "vitest";
import { isImageBytes, sha1Hex, extractImagesFromMessage } from "./images";

describe("sha1Hex", () => {
  it("matches known vectors", () => {
    expect(sha1Hex(new Uint8Array())).toBe(
      "da39a3ee5e6b4b0d3255bfef95601890afd80709"
    );
    expect(sha1Hex(new TextEncoder().encode("abc"))).toBe(
      "a9993e364706816aba3e25717850c26c9cd0d89d"
    );
  });
});

describe("isImageBytes", () => {
  it("detects PNG magic", () => {
    const png = new Uint8Array(16);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    expect(isImageBytes(png)).toBe(true);
  });
  it("rejects short / non-image", () => {
    expect(isImageBytes(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("extractImagesFromMessage", () => {
  it("indexes image-like blobs by sha1", () => {
    // Minimal fake JPEG header (enough for magic check)
    const jpeg = new Uint8Array(32);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    jpeg[3] = 0xe0;
    const hash = sha1Hex(jpeg);
    const map = extractImagesFromMessage({
      blobs: [{ bytes: jpeg }, { bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) }],
    });
    expect(map.size).toBe(1);
    expect(map.has(hash)).toBe(true);
  });
});

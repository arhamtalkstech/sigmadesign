/**
 * Static check: Design panel source exposes controls for common node types.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "PropertiesPanel.tsx"),
  "utf8"
);

describe("properties surface", () => {
  it("exposes size, fill, stroke, font, image, and comment controls", () => {
    const required = [
      "Width",
      "Height",
      "Fill",
      "Stroke",
      "Font size",
      "Font family",
      "Image scale mode",
      "Corner radius",
      "Comment message",
      "Apply variable",
      "Rotation degrees",
      "Horizontal constraint",
    ];
    const missing = required.filter((label) => !src.includes(label));
    expect(missing).toEqual([]);
  });
});

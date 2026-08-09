import { describe, expect, it } from "vitest";
import {
  canvasFontFromTextStyle,
  fontFamilyStack,
  parseFontStyle,
} from "./design-fonts";

describe("design-fonts (shipped path)", () => {
  it("maps Figma style labels to distinct CSS weights", () => {
    expect(parseFontStyle("Regular").weight).toBe(400);
    expect(parseFontStyle("Medium").weight).toBe(500);
    expect(parseFontStyle("SemiBold").weight).toBe(600);
    expect(parseFontStyle("Semi Bold").weight).toBe(600);
    expect(parseFontStyle("Bold").weight).toBe(700);
    expect(parseFontStyle("Light").weight).toBe(300);
    expect(parseFontStyle("Italic").italic).toBe(true);
    expect(parseFontStyle("Medium Italic").weight).toBe(500);
    expect(parseFontStyle("Medium Italic").italic).toBe(true);
  });

  it("builds distinct font stacks for mono vs sans families", () => {
    expect(fontFamilyStack("Geist")).toMatch(/Geist/);
    expect(fontFamilyStack("Inter")).toMatch(/Inter/);
    expect(fontFamilyStack("SF Mono")).toMatch(/monospace/i);
    expect(fontFamilyStack("JetBrains Mono")).toMatch(/mono/i);
  });

  it("canvasFontFromTextStyle encodes weight + family for canvas", () => {
    const geistMed = canvasFontFromTextStyle({
      fontFamily: "Geist",
      fontStyle: "Medium",
      fontSize: 14,
    });
    expect(geistMed).toMatch(/^500 14px/);
    expect(geistMed).toMatch(/Geist/);

    const interSemi = canvasFontFromTextStyle({
      fontFamily: "Inter",
      fontStyle: "Semi Bold",
      fontSize: 14,
    });
    expect(interSemi).toMatch(/^600 14px/);
    expect(interSemi).toMatch(/Inter/);

    // Must differ so Medium Geist ≠ Regular Inter
    expect(geistMed).not.toBe(interSemi);
  });
});

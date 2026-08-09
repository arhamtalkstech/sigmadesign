/**
 * Structural checks on shipped UI chrome: form contrast tokens + Lucide icons.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LAYER_TYPE_ICONS, TOOL_ICONS } from "./chrome-icons";
import { CONTEXT_MENU_ITEMS } from "./context-menu-actions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

/** Emoji / pictograph ranges often used as fake icons */
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}\u{2300}-\u{23FF}]/u;

describe("form contrast tokens (shipped CSS)", () => {
  it("defines dark field bg + light text + placeholder on .field-input", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/--field-bg\s*:/);
    expect(css).toMatch(/--field-text\s*:/);
    expect(css).toMatch(/--field-placeholder\s*:/);
    expect(css).toMatch(/\.field-input/);
    // Explicit dark backgrounds (not white)
    expect(css).toMatch(/--field-bg:\s*#[0-2][0-9a-f]{5}/i);
    expect(css).toMatch(/background:\s*var\(--field-bg\)/);
    expect(css).toMatch(/color:\s*var\(--field-text\)/);
    expect(css).toMatch(/::placeholder/);
    // color-scheme dark for native controls
    expect(css).toMatch(/color-scheme:\s*dark/);
  });
});

describe("Lucide chrome icons (shipped modules)", () => {
  it("maps all tools to Lucide icon components", () => {
    for (const tool of Object.keys(TOOL_ICONS)) {
      const ico = TOOL_ICONS[tool as keyof typeof TOOL_ICONS];
      // lucide-react icons are forwardRef objects or functions
      expect(ico).toBeTruthy();
      expect(["function", "object"]).toContain(typeof ico);
    }
  });

  it("maps layer types used in layers panel", () => {
    for (const t of ["FRAME", "RECTANGLE", "TEXT", "VECTOR", "INSTANCE"]) {
      expect(LAYER_TYPE_ICONS[t]).toBeTruthy();
    }
  });

  it("ToolRail and LayersPanel import chrome-icons (no emoji icon tables)", () => {
    const rail = read("components/ToolRail.tsx");
    const layers = read("components/LayersPanel.tsx");
    expect(rail).toMatch(/TOOL_ICONS|chrome-icons/);
    expect(layers).toMatch(/LAYER_TYPE_ICONS|chrome-icons/);
    expect(rail).not.toMatch(EMOJI_RE);
    // layers may have no emoji after lucide swap
    expect(layers).not.toMatch(EMOJI_RE);
  });

  it("package.json depends on lucide-react", () => {
    const pkg = JSON.parse(read("../package.json"));
    expect(pkg.dependencies["lucide-react"]).toBeTruthy();
  });
});

describe("context menu wiring (shipped source)", () => {
  it("Canvas registers contextmenu and ContextMenu component", () => {
    const canvas = read("components/Canvas.tsx");
    expect(canvas).toMatch(/onContextMenu/);
    expect(canvas).toMatch(/ContextMenu/);
    expect(canvas).toMatch(/applyMenuAction/);
  });

  it("Canvas pointer-down ignores secondary button for create/select/move", () => {
    const canvas = read("components/Canvas.tsx");
    // Must early-return on right-click so document is not mutated before contextmenu
    expect(canvas).toMatch(/e\.button\s*===\s*2/);
    expect(canvas).toMatch(/e\.button\s*!==\s*0/);
    // Wrapper also skips button 2 before full handler
    expect(canvas).toMatch(/button === 2[\s\S]{0,80}return/);
  });

  it("menu items cover properties + visibility + structural action", () => {
    const ids = CONTEXT_MENU_ITEMS.map((i) => i.id);
    expect(ids).toContain("edit-properties");
    expect(ids).toContain("toggle-visibility");
    expect(ids.some((id) => ["delete", "duplicate", "bring-to-front"].includes(id))).toBe(
      true
    );
  });
});

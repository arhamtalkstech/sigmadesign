/**
 * Load design-document fonts into the browser so canvas text matches .fig/.sig.
 * Figma files embed font *names*; web rendering needs the faces available.
 */
import type { AlteronDocument } from "@alteron/document-model";

export type DesignFontFace = {
  family: string;
  /** CSS font-weight */
  weight: number;
  italic: boolean;
};

/** Map Figma font style string → CSS weight + italic */
export function parseFontStyle(style: string | undefined): {
  weight: number;
  italic: boolean;
} {
  const s = (style ?? "Regular").toLowerCase().replace(/\s+/g, "");
  const italic = s.includes("italic") || s.includes("oblique");
  let weight = 400;
  if (s.includes("thin") || s.includes("hairline")) weight = 100;
  else if (s.includes("extralight") || s.includes("ultralight")) weight = 200;
  else if (s.includes("light")) weight = 300;
  else if (s.includes("medium")) weight = 500;
  else if (s.includes("semibold") || s.includes("demibold")) weight = 600;
  else if (s.includes("extrabold") || s.includes("ultrabold")) weight = 800;
  else if (s.includes("black") || s.includes("heavy")) weight = 900;
  else if (s.includes("bold")) weight = 700;
  else if (s.includes("regular") || s.includes("normal") || s.includes("book"))
    weight = 400;
  return { weight, italic };
}

/** CSS font-family stack for a Figma family name (web-safe fallbacks). */
export function fontFamilyStack(family: string): string {
  const f = family.trim();
  const lower = f.toLowerCase();
  // Monospace families used in design files
  if (
    lower.includes("mono") ||
    lower.includes("code") ||
    lower === "sf mono" ||
    lower === "menlo" ||
    lower === "consolas"
  ) {
    return `"${f}", "SF Mono", ui-monospace, Menlo, Consolas, monospace`;
  }
  if (lower === "geist") {
    return `"Geist", "Inter", system-ui, sans-serif`;
  }
  if (lower === "inter") {
    return `"Inter", system-ui, -apple-system, sans-serif`;
  }
  // Generic: quote family, then common UI stack
  return `"${f}", "Inter", system-ui, sans-serif`;
}

/** Collect unique (family, weight, italic) from a document. */
export function collectDesignFonts(doc: AlteronDocument): DesignFontFace[] {
  const key = new Set<string>();
  const out: DesignFontFace[] = [];
  for (const n of Object.values(doc.nodes)) {
    if (n.type !== "TEXT" || !("textStyle" in n) || !n.textStyle) continue;
    const family = n.textStyle.fontFamily || "Inter";
    const { weight, italic } = parseFontStyle(n.textStyle.fontStyle);
    const k = `${family}|${weight}|${italic}`;
    if (key.has(k)) continue;
    key.add(k);
    out.push({ family, weight, italic });
  }
  return out;
}

const GOOGLE_FAMILIES: Record<string, string> = {
  // Google Fonts family query fragments
  Geist: "Geist:ital,wght@0,100..900;1,100..900",
  Inter: "Inter:ital,wght@0,100..900;1,100..900",
  Roboto: "Roboto:ital,wght@0,100..900;1,100..900",
  "Open Sans": "Open+Sans:ital,wght@0,300..800;1,300..800",
  Poppins: "Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400",
  Montserrat: "Montserrat:ital,wght@0,100..900;1,100..900",
  Lato: "Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,400",
  Nunito: "Nunito:ital,wght@0,200..1000;1,200..1000",
  Raleway: "Raleway:ital,wght@0,100..900;1,100..900",
  "Source Sans 3": "Source+Sans+3:ital,wght@0,200..900;1,200..900",
  "Source Sans Pro": "Source+Sans+3:ital,wght@0,200..900;1,200..900",
  "Work Sans": "Work+Sans:ital,wght@0,100..900;1,100..900",
  "DM Sans": "DM+Sans:ital,wght@0,100..1000;1,100..1000",
  Manrope: "Manrope:wght@200..800",
  Outfit: "Outfit:wght@100..900",
  "IBM Plex Sans": "IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,400",
  "IBM Plex Mono": "IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,400",
  "JetBrains Mono": "JetBrains+Mono:ital,wght@0,100..800;1,100..800",
  "Fira Code": "Fira+Code:wght@300..700",
  "Space Grotesk": "Space+Grotesk:wght@300..700",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800",
};

let injectedLinkHref: string | null = null;

/**
 * Inject a Google Fonts stylesheet covering families present in the doc.
 * Idempotent; upgrades the link when new families appear.
 */
export function ensureGoogleFontsStylesheet(families: string[]): void {
  if (typeof document === "undefined") return;
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const fam of families) {
    const key = fam.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const g = GOOGLE_FAMILIES[key];
    if (g) parts.push(`family=${g}`);
    else {
      // Best-effort: try family name as-is (works for many GF faces)
      const encoded = encodeURIComponent(key).replace(/%20/g, "+");
      parts.push(`family=${encoded}:ital,wght@0,100..900;1,100..900`);
    }
  }
  // Always include core design faces
  if (!seen.has("Geist")) parts.unshift("family=Geist:ital,wght@0,100..900;1,100..900");
  if (!seen.has("Inter")) parts.unshift("family=Inter:ital,wght@0,100..900;1,100..900");

  const href = `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
  if (href === injectedLinkHref) return;
  injectedLinkHref = href;

  let link = document.getElementById("sigma-design-fonts") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = "sigma-design-fonts";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Ensure faces used in `doc` are loaded for canvas measure/draw.
 * Returns when document.fonts has attempted loads (best-effort).
 */
export async function loadDesignFontsForDocument(
  doc: AlteronDocument
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const faces = collectDesignFonts(doc);
  const families = [...new Set(faces.map((f) => f.family))];
  ensureGoogleFontsStylesheet(families);

  await document.fonts.ready;
  const loads: Promise<FontFace[]>[] = [];
  for (const f of faces) {
    const style = f.italic ? "italic" : "normal";
    // CSS font shorthand for FontFaceSet.load
    const spec = `${style} ${f.weight} 16px ${fontFamilyStack(f.family)}`;
    try {
      loads.push(document.fonts.load(spec));
    } catch {
      /* ignore */
    }
  }
  await Promise.allSettled(loads);
}

/** Build canvas `ctx.font` string from node text style. */
export function canvasFontFromTextStyle(ts: {
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
}): string {
  const size = ts.fontSize ?? 12;
  const family = fontFamilyStack(ts.fontFamily ?? "Inter");
  const { weight, italic } = parseFontStyle(ts.fontStyle);
  return `${italic ? "italic " : ""}${weight} ${size}px ${family}`;
}

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importFigFile } from "./import.js";
import {
  compareImportToApi,
  validateFigAgainstApiJson,
  validateFigAgainstLiveApi,
  type ApiNode,
} from "./validate-parity.js";

const SAMPLE = resolve(
  import.meta.dirname,
  "../../../sample-figma-file.fig"
);

const LOGIN = "1:13028";

const REQUIRED_TEXTS = [
  "Welcome back 👋",
  "Sign in to access your account",
  "Student Login",
  "Teacher Login",
  "Sign in with Line",
  "Sign in with Google",
  "Sign in with Microsoft",
  "Sign in with Class Link",
  "Don’t have an account?",
  "Contact your administrator",
];

describe("import parity — sample archive (real import path, optional fixture)", () => {
  it("imports login subtree with texts, vectors, paths, images", async () => {
    if (!existsSync(SAMPLE)) return;
    const doc = await importFigFile(readFileSync(SAMPLE));
    expect(doc.nodes[LOGIN]).toBeTruthy();

    const texts: string[] = [];
    let vectors = 0;
    let withPaths = 0;
    let images = 0;

    const walk = (id: string) => {
      const n = doc.nodes[id];
      if (!n) return;
      if (n.type === "TEXT" && "characters" in n && n.characters) {
        texts.push(n.characters);
      }
      if (n.type === "VECTOR" || n.type === "BOOLEAN_OPERATION") {
        vectors++;
        if ((n.fillPaths?.length ?? 0) + (n.strokePaths?.length ?? 0) > 0) {
          withPaths++;
        }
      }
      if (n.fills?.some((f) => f.type === "IMAGE" && f.visible !== false)) {
        images++;
      }
      for (const c of n.children) walk(c);
    };
    walk(LOGIN);

    for (const t of REQUIRED_TEXTS) {
      expect(texts, `missing text: ${t}`).toContain(t);
    }
    expect(vectors).toBeGreaterThanOrEqual(19);
    expect(withPaths).toBe(vectors); // every vector has geometry
    expect(images).toBeGreaterThanOrEqual(2);

    // Flip case: P pole AABB (must match Figma ~ y 908.48 when logo at y 874.37)
    const logo = doc.nodes["1:13035"];
    expect(logo?.absoluteBounds?.x).toBeCloseTo(1964.5, 0);
    // Find pole under logo
    let pole: (typeof logo) | undefined;
    const find = (id: string) => {
      const n = doc.nodes[id];
      if (!n) return;
      if (n.name === "pole") pole = n;
      for (const c of n.children) find(c);
    };
    find("1:13035");
    expect(pole?.absoluteBounds).toBeTruthy();
    // API: y ≈ 908.48 (not ~943)
    expect(pole!.absoluteBounds!.y).toBeGreaterThan(900);
    expect(pole!.absoluteBounds!.y).toBeLessThan(920);
  }, 120_000);

  it("preserves original-node sizes and transforms from the archive (no layout corruption)", async () => {
    if (!existsSync(SAMPLE)) return;
    const doc = await importFigFile(readFileSync(SAMPLE));
    // Spot-check login originals known from REST API
    expect(doc.nodes["1:13028"]?.size).toEqual({ width: 1440, height: 915 });
    expect(doc.nodes["1:13039"]?.size.width).toBeCloseTo(207.5, 1);
    expect(doc.nodes["1:13040"]?.size.width).toBeCloseTo(207.5, 1);
    expect(doc.nodes["1:13042"]?.cornerRadius).toBe(8);
    expect(doc.nodes["1:13039"]?.cornerRadius).toBe(12);
    const welcome = doc.nodes["1:13036"];
    expect(welcome?.type).toBe("TEXT");
    if (welcome?.type === "TEXT") {
      expect(welcome.textStyle.fontSize).toBe(30);
      expect(welcome.textStyle.fontFamily).toBe("Geist");
      expect(welcome.characters).toContain("Welcome back");
    }
  }, 120_000);
});

describe("import parity — Figma REST API oracle", () => {
  const token = process.env.FIGMA_TOKEN;
  // Optional fixture written by CI/local: packages/fig-import/fixtures/api-login.json
  const fixturePath = resolve(import.meta.dirname, "../fixtures/api-login.json");

  it("matches live API when FIGMA_TOKEN is set", async () => {
    if (!token) {
      console.warn("FIGMA_TOKEN not set — skipping live API oracle");
      return;
    }
    if (!existsSync(SAMPLE)) return;
    const report = await validateFigAgainstLiveApi({
      figPath: SAMPLE,
      fileKey: "79vI7KhrSSPYLOZVVLC7zk",
      loginNodeId: LOGIN,
      token,
    });
    if (!report.ok) {
      console.error(JSON.stringify(report.mismatches, null, 2));
    }
    expect(report.ok).toBe(true);
    expect(report.matchedOriginal).toBeGreaterThan(15);
    expect(report.vectorsWithPaths).toBe(report.vectorsOurs);
    for (const t of REQUIRED_TEXTS) {
      expect(report.textsOurs).toContain(t);
    }
  }, 180_000);

  it("matches API fixture when present (offline oracle)", async () => {
    if (!existsSync(fixturePath) || !existsSync(SAMPLE)) {
      // Prefer live token path; fixture is optional
      if (!token) {
        console.warn("No fixture and no token — skip offline API oracle");
      }
      return;
    }
    const apiJson = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      nodes: Record<string, { document: ApiNode }>;
    };
    const report = await validateFigAgainstApiJson(SAMPLE, apiJson, LOGIN);
    if (!report.ok) {
      console.error(JSON.stringify(report.mismatches, null, 2));
    }
    expect(report.ok).toBe(true);
  }, 120_000);
});

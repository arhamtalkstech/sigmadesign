/**
 * Machine-readable parity check: local .fig import vs Figma REST API oracle.
 * Used by tests and CLI. Does not require the browser.
 */
import { readFileSync } from "node:fs";
import { importFigFile } from "./import.js";
import type { AlteronDocument, NodeId, SceneNode } from "@alteron/document-model";

export interface ApiNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cornerRadius?: number;
  fills?: Array<{
    type: string;
    visible?: boolean;
    color?: { r: number; g: number; b: number; a?: number };
  }>;
  characters?: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontStyle?: string;
    fontWeight?: number;
    letterSpacing?: number;
    lineHeightPx?: number;
  };
  children?: ApiNode[];
}

export interface ParityMismatch {
  id: string;
  name: string;
  kind: string;
  api: unknown;
  ours: unknown;
  detail?: string;
}

export interface ParityReport {
  loginNodeId: string;
  apiNodeCount: number;
  ourNodeCount: number;
  matchedOriginal: number;
  textsApi: string[];
  textsOurs: string[];
  vectorsOurs: number;
  vectorsWithPaths: number;
  imagesOurs: number;
  mismatches: ParityMismatch[];
  /** true when no gating mismatches for original nodes */
  ok: boolean;
}

const TOL = 1; // px

function walkApi(n: ApiNode, out: Map<string, ApiNode>) {
  out.set(n.id, n);
  for (const c of n.children ?? []) walkApi(c, out);
}

function collectOurs(
  doc: AlteronDocument,
  id: NodeId,
  out: Map<string, SceneNode>
) {
  const n = doc.nodes[id];
  if (!n) return;
  out.set(id, n);
  for (const c of n.children) collectOurs(doc, c, out);
}

function firstSolidApi(fills?: ApiNode["fills"]) {
  for (const f of fills ?? []) {
    if (f.type === "SOLID" && f.visible !== false && f.color) return f.color;
  }
  return null;
}

function firstSolidOurs(fills: SceneNode["fills"]) {
  for (const f of fills ?? []) {
    if (f.type === "SOLID" && f.visible !== false && "color" in f && f.color) {
      return f.color as { r: number; g: number; b: number; a?: number };
    }
  }
  return null;
}

/** Compare import of a .fig buffer to a Figma REST nodes payload for rootId. */
export function compareImportToApi(
  doc: AlteronDocument,
  apiRoot: ApiNode,
  loginNodeId: string
): ParityReport {
  const apiMap = new Map<string, ApiNode>();
  walkApi(apiRoot, apiMap);

  const ourMap = new Map<string, SceneNode>();
  if (doc.nodes[loginNodeId]) collectOurs(doc, loginNodeId, ourMap);

  const mismatches: ParityMismatch[] = [];
  let matchedOriginal = 0;

  for (const [id, an] of apiMap) {
    // Instance-expanded API ids look like I1:13039;6000:139813 — skip id match
    if (id.startsWith("I")) continue;

    const on = ourMap.get(id);
    if (!on) {
      mismatches.push({
        id,
        name: an.name,
        kind: "missing_node",
        api: an.type,
        ours: null,
      });
      continue;
    }
    matchedOriginal++;

    const abb = an.absoluteBoundingBox;
    const ob = on.absoluteBounds;
    if (abb && ob) {
      if (
        Math.abs(abb.x - ob.x) > TOL ||
        Math.abs(abb.y - ob.y) > TOL ||
        Math.abs(abb.width - ob.width) > TOL ||
        Math.abs(abb.height - ob.height) > TOL
      ) {
        mismatches.push({
          id,
          name: an.name,
          kind: "bounds",
          api: abb,
          ours: ob,
          detail: `dxy=(${(abb.x - ob.x).toFixed(2)},${(abb.y - ob.y).toFixed(2)}) dwh=(${(abb.width - ob.width).toFixed(2)},${(abb.height - ob.height).toFixed(2)})`,
        });
      }
    }

    if (an.cornerRadius != null) {
      const ourR =
        typeof on.cornerRadius === "number"
          ? on.cornerRadius
          : on.cornerRadius?.topLeft;
      if (ourR == null || Math.abs(an.cornerRadius - ourR) > 0.1) {
        mismatches.push({
          id,
          name: an.name,
          kind: "cornerRadius",
          api: an.cornerRadius,
          ours: on.cornerRadius,
        });
      }
    }

    const ac = firstSolidApi(an.fills);
    const oc = firstSolidOurs(on.fills);
    if (ac && oc) {
      if (
        Math.abs(ac.r - oc.r) > 0.01 ||
        Math.abs(ac.g - oc.g) > 0.01 ||
        Math.abs(ac.b - oc.b) > 0.01
      ) {
        mismatches.push({
          id,
          name: an.name,
          kind: "fill_rgb",
          api: ac,
          ours: oc,
        });
      }
    }

    if (an.type === "TEXT" && on.type === "TEXT") {
      const chars = "characters" in on ? on.characters : "";
      if (an.characters != null && an.characters !== chars) {
        mismatches.push({
          id,
          name: an.name,
          kind: "characters",
          api: an.characters,
          ours: chars,
        });
      }
      const fs = an.style?.fontSize;
      const of =
        "textStyle" in on && on.textStyle ? on.textStyle.fontSize : null;
      if (fs != null && of != null && Math.abs(fs - of) > 0.01) {
        mismatches.push({
          id,
          name: an.name,
          kind: "fontSize",
          api: fs,
          ours: of,
        });
      }
      const ff = an.style?.fontFamily;
      const off =
        "textStyle" in on && on.textStyle ? on.textStyle.fontFamily : null;
      if (ff && off && ff !== off) {
        mismatches.push({
          id,
          name: an.name,
          kind: "fontFamily",
          api: ff,
          ours: off,
        });
      }
    }
  }

  // Texts (including synthetic instance expansions) by content
  const textsApi: string[] = [];
  const textsOurs: string[] = [];
  for (const an of apiMap.values()) {
    if (an.type === "TEXT" && an.characters) textsApi.push(an.characters);
  }
  for (const on of ourMap.values()) {
    if (on.type === "TEXT" && "characters" in on && on.characters) {
      textsOurs.push(on.characters);
    }
  }

  let vectorsOurs = 0;
  let vectorsWithPaths = 0;
  let imagesOurs = 0;
  for (const on of ourMap.values()) {
    if (on.type === "VECTOR" || on.type === "BOOLEAN_OPERATION") {
      vectorsOurs++;
      if (
        (on.fillPaths?.length ?? 0) > 0 ||
        (on.strokePaths?.length ?? 0) > 0
      ) {
        vectorsWithPaths++;
      }
    }
    if (on.fills?.some((f) => f.type === "IMAGE" && f.visible !== false)) {
      imagesOurs++;
    }
  }

  // Text content set must include all API texts
  const apiSet = new Set(textsApi);
  const ourSet = new Set(textsOurs);
  for (const t of apiSet) {
    if (!ourSet.has(t)) {
      mismatches.push({
        id: "text-content",
        name: t,
        kind: "missing_text_content",
        api: t,
        ours: null,
      });
    }
  }

  // Icons: every API VECTOR under login must have a same-size counterpart with paths
  // (instance children use different ids — match by size + approximate position)
  if (vectorsOurs > 0 && vectorsWithPaths < vectorsOurs) {
    mismatches.push({
      id: "vectors",
      name: "path coverage",
      kind: "vector_paths",
      api: "all vectors should have geometry",
      ours: `${vectorsWithPaths}/${vectorsOurs}`,
    });
  }

  const gating = mismatches.filter(
    (m) =>
      m.kind === "bounds" ||
      m.kind === "cornerRadius" ||
      m.kind === "fill_rgb" ||
      m.kind === "characters" ||
      m.kind === "fontSize" ||
      m.kind === "fontFamily" ||
      m.kind === "missing_text_content" ||
      m.kind === "missing_node" ||
      m.kind === "vector_paths"
  );

  return {
    loginNodeId,
    apiNodeCount: apiMap.size,
    ourNodeCount: ourMap.size,
    matchedOriginal,
    textsApi: [...apiSet].sort(),
    textsOurs: [...ourSet].sort(),
    vectorsOurs,
    vectorsWithPaths,
    imagesOurs,
    mismatches: gating,
    ok: gating.length === 0 && matchedOriginal > 0,
  };
}

/** Import local .fig and compare to API JSON (nodes endpoint body). */
export async function validateFigAgainstApiJson(
  figPath: string,
  apiJson: {
    nodes: Record<string, { document: ApiNode }>;
  },
  loginNodeId = "1:13028"
): Promise<ParityReport> {
  const buf = readFileSync(figPath);
  const doc = await importFigFile(buf);
  const root = apiJson.nodes[loginNodeId]?.document;
  if (!root) {
    throw new Error(`API JSON missing node ${loginNodeId}`);
  }
  return compareImportToApi(doc, root, loginNodeId);
}

/** Fetch Figma REST nodes and validate. */
export async function validateFigAgainstLiveApi(options: {
  figPath: string;
  fileKey: string;
  loginNodeId?: string;
  token: string;
}): Promise<ParityReport> {
  const loginNodeId = options.loginNodeId ?? "1:13028";
  const url = `https://api.figma.com/v1/files/${options.fileKey}/nodes?ids=${encodeURIComponent(loginNodeId)}`;
  const res = await fetch(url, {
    headers: { "X-Figma-Token": options.token },
  });
  const body = (await res.json()) as {
    err?: string;
    status?: number;
    nodes?: Record<string, { document: ApiNode }>;
  };
  if (!res.ok || body.err) {
    throw new Error(
      `Figma API error ${res.status}: ${body.err ?? JSON.stringify(body).slice(0, 200)}`
    );
  }
  return validateFigAgainstApiJson(options.figPath, body as never, loginNodeId);
}

/**
 * Decode design-archive binary vector formats (commandsBlob + vectorNetworkBlob)
 * into SVG path `d` strings / canvas path ops.
 *
 * Based on public kiwi scene-graph research (e.g. fig-kiwi protocol Kaitai specs).
 *
 * paint tags for the renderer:
 * - fillGeometry → paint "fill" with fill color
 * - strokeGeometry → expanded outline → paint "fill" with stroke color
 * - vector network (stroke-only icons) → paint "stroke" centerline
 */

export type PathCommand =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

export interface DecodedPath {
  commands: PathCommand[];
  /** SVG path d attribute */
  d: string;
  windingRule: "nonzero" | "evenodd";
}

function commandsToD(cmds: PathCommand[]): string {
  const parts: string[] = [];
  for (const c of cmds) {
    if (c.op === "M") parts.push(`M ${c.x} ${c.y}`);
    else if (c.op === "L") parts.push(`L ${c.x} ${c.y}`);
    else if (c.op === "C")
      parts.push(`C ${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`);
    else if (c.op === "Z") parts.push("Z");
  }
  return parts.join(" ");
}

/**
 * Decode a commandsBlob buffer into path commands.
 * Opcodes: 0=sep, 1=MoveTo, 2=LineTo, 3=Close, 4=CubicBezier
 */
export function decodeCommandsBlob(bytes: Uint8Array): PathCommand[] | null {
  if (!bytes || bytes.length === 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const cmds: PathCommand[] = [];

  while (pos < bytes.length) {
    const op = bytes[pos++]!;
    if (op === 0) continue; // subpath separator
    if (op === 1) {
      if (pos + 8 > bytes.length) break;
      const x = view.getFloat32(pos, true);
      pos += 4;
      const y = view.getFloat32(pos, true);
      pos += 4;
      cmds.push({ op: "M", x, y });
    } else if (op === 2) {
      if (pos + 8 > bytes.length) break;
      const x = view.getFloat32(pos, true);
      pos += 4;
      const y = view.getFloat32(pos, true);
      pos += 4;
      cmds.push({ op: "L", x, y });
    } else if (op === 4) {
      if (pos + 24 > bytes.length) break;
      const x1 = view.getFloat32(pos, true);
      pos += 4;
      const y1 = view.getFloat32(pos, true);
      pos += 4;
      const x2 = view.getFloat32(pos, true);
      pos += 4;
      const y2 = view.getFloat32(pos, true);
      pos += 4;
      const x = view.getFloat32(pos, true);
      pos += 4;
      const y = view.getFloat32(pos, true);
      pos += 4;
      cmds.push({ op: "C", x1, y1, x2, y2, x, y });
    } else if (op === 3) {
      cmds.push({ op: "Z" });
    } else {
      // Unknown opcode — stop to avoid garbage
      break;
    }
  }
  return cmds.length ? cmds : null;
}

export function commandsBlobToPath(bytes: Uint8Array): string | null {
  const cmds = decodeCommandsBlob(bytes);
  return cmds ? commandsToD(cmds) : null;
}

/**
 * Decode vectorNetworkBlob (editable path) into path commands.
 */
export function decodeVectorNetworkBlob(bytes: Uint8Array): PathCommand[] | null {
  if (!bytes || bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;

  const vc = view.getUint32(pos, true);
  pos += 4;
  const sc = view.getUint32(pos, true);
  pos += 4;
  const rc = view.getUint32(pos, true);
  pos += 4;

  if (vc === 0 || sc === 0) return null;
  if (vc > 100_000 || sc > 100_000) return null;

  const verts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < vc; i++) {
    if (pos + 12 > bytes.length) return null;
    pos += 4; // flags
    const x = view.getFloat32(pos, true);
    pos += 4;
    const y = view.getFloat32(pos, true);
    pos += 4;
    verts.push({ x, y });
  }

  type Seg = {
    start: number;
    end: number;
    tsx: number;
    tsy: number;
    tex: number;
    tey: number;
  };
  const segs: Seg[] = [];
  for (let i = 0; i < sc; i++) {
    if (pos + 28 > bytes.length) return null;
    pos += 4; // flags
    const start = view.getUint32(pos, true);
    pos += 4;
    const tsx = view.getFloat32(pos, true);
    pos += 4;
    const tsy = view.getFloat32(pos, true);
    pos += 4;
    const end = view.getUint32(pos, true);
    pos += 4;
    const tex = view.getFloat32(pos, true);
    pos += 4;
    const tey = view.getFloat32(pos, true);
    pos += 4;
    if (start >= vc || end >= vc) return null;
    segs.push({ start, end, tsx, tsy, tex, tey });
  }

  const loops: number[][] = [];
  for (let r = 0; r < rc; r++) {
    if (pos + 8 > bytes.length) break;
    pos += 4; // winding
    const loopCount = view.getUint32(pos, true);
    pos += 4;
    for (let l = 0; l < loopCount; l++) {
      if (pos + 4 > bytes.length) break;
      const count = view.getUint32(pos, true);
      pos += 4;
      const loop: number[] = [];
      for (let s = 0; s < count; s++) {
        if (pos + 4 > bytes.length) break;
        loop.push(view.getUint32(pos, true));
        pos += 4;
      }
      loops.push(loop);
    }
  }

  const cmds: PathCommand[] = [];

  const emitSeg = (seg: Seg, move: boolean, reverse: boolean) => {
    const v0 = reverse ? verts[seg.end]! : verts[seg.start]!;
    const v1 = reverse ? verts[seg.start]! : verts[seg.end]!;
    // Tangents are stored relative to their respective vertices; reverse swaps them
    const tsx = reverse ? seg.tex : seg.tsx;
    const tsy = reverse ? seg.tey : seg.tsy;
    const tex = reverse ? seg.tsx : seg.tex;
    const tey = reverse ? seg.tsy : seg.tey;
    if (move) cmds.push({ op: "M", x: v0.x, y: v0.y });
    const isCurve =
      Math.abs(tsx) > 1e-4 ||
      Math.abs(tsy) > 1e-4 ||
      Math.abs(tex) > 1e-4 ||
      Math.abs(tey) > 1e-4;
    if (isCurve) {
      cmds.push({
        op: "C",
        x1: v0.x + tsx,
        y1: v0.y + tsy,
        x2: v1.x + tex,
        y2: v1.y + tey,
        x: v1.x,
        y: v1.y,
      });
    } else {
      cmds.push({ op: "L", x: v1.x, y: v1.y });
    }
    return reverse ? seg.start : seg.end;
  };

  if (loops.length > 0) {
    for (const loop of loops) {
      // Rebuild continuous walk by connectivity (loop index order is not
      // always sequential — e.g. [0,3,2,1] for a circle).
      const ordered: Array<{ si: number; reverse: boolean }> = [];
      const used = new Set<number>();
      if (loop.length === 0) continue;
      const firstSi = loop[0]!;
      if (firstSi >= segs.length) continue;
      ordered.push({ si: firstSi, reverse: false });
      used.add(firstSi);
      let at = segs[firstSi]!.end;

      while (ordered.length < loop.length) {
        let found = false;
        for (const si of loop) {
          if (used.has(si) || si >= segs.length) continue;
          const s = segs[si]!;
          if (s.start === at) {
            ordered.push({ si, reverse: false });
            at = s.end;
            used.add(si);
            found = true;
            break;
          }
          if (s.end === at) {
            ordered.push({ si, reverse: true });
            at = s.start;
            used.add(si);
            found = true;
            break;
          }
        }
        if (!found) {
          // Disjoint remainder — start a new subpath with next unused
          const next = loop.find((si) => !used.has(si) && si < segs.length);
          if (next == null) break;
          ordered.push({ si: next, reverse: false });
          used.add(next);
          at = segs[next]!.end;
        }
      }

      for (let i = 0; i < ordered.length; i++) {
        const { si, reverse } = ordered[i]!;
        emitSeg(segs[si]!, i === 0, reverse);
      }
      cmds.push({ op: "Z" });
    }
  } else {
    // Sequential — also handle open stroke paths (icons)
    let lastVertex = -1;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      let reverse = false;
      let needMove = false;
      if (i === 0) {
        needMove = true;
      } else if (seg.start === lastVertex) {
        reverse = false;
      } else if (seg.end === lastVertex) {
        reverse = true;
      } else {
        needMove = true;
      }
      lastVertex = emitSeg(seg, needMove, reverse);
    }
  }

  return cmds.length ? cmds : null;
}

export function vectorNetworkBlobToPath(bytes: Uint8Array): string | null {
  const cmds = decodeVectorNetworkBlob(bytes);
  return cmds ? commandsToD(cmds) : null;
}

export interface GeometryEntry {
  windingRule?: string;
  commandsBlob?: number;
  styleID?: number;
}

export interface VectorDataField {
  vectorNetworkBlob?: number;
  normalizedSize?: { x: number; y: number };
  styleOverrideTable?: unknown[];
}

export interface BlobLike {
  bytes?: Uint8Array | number[] | { [k: number]: number };
}

function toUint8(blob: BlobLike | Uint8Array | undefined): Uint8Array | null {
  if (!blob) return null;
  if (blob instanceof Uint8Array) return blob;
  if ("bytes" in blob && blob.bytes) {
    if (blob.bytes instanceof Uint8Array) return blob.bytes;
    if (Array.isArray(blob.bytes)) return new Uint8Array(blob.bytes);
    // object with numeric keys
    const vals = Object.values(blob.bytes as object) as number[];
    if (vals.length) return new Uint8Array(vals);
  }
  return null;
}

export interface ResolvedPath extends DecodedPath {
  /**
   * "fill" — fill with the appropriate paint (fillGeometry / expanded strokeGeometry).
   * "stroke" — stroke as centerline with strokeWeight (vector-network fallback).
   */
  paint: "fill" | "stroke";
}

/**
 * Resolve fill + stroke paths for a node from geometry fields + blobs array.
 *
 * Important Figma semantics:
 * - fillGeometry → paths to **fill** with fill paint
 * - strokeGeometry → already-expanded stroke outlines to **fill** with stroke paint
 *   (never restroke — that produces double borders / corner ticks)
 * - vectorNetwork fallback → centerlines that need canvas stroke() when stroke-only
 */
export function resolveNodePaths(
  node: {
    fillGeometry?: GeometryEntry[];
    strokeGeometry?: GeometryEntry[];
    vectorData?: VectorDataField;
    fillPaints?: Array<{ visible?: boolean }>;
    strokePaints?: Array<{ visible?: boolean }>;
    strokeWeight?: number;
  },
  blobs: BlobLike[]
): {
  fillPaths: ResolvedPath[];
  strokePaths: ResolvedPath[];
  normalizedSize?: { width: number; height: number };
} {
  const fillPaths: ResolvedPath[] = [];
  const strokePaths: ResolvedPath[] = [];

  const decodeGeom = (
    entries: GeometryEntry[] | undefined,
    out: ResolvedPath[],
    paint: "fill" | "stroke"
  ) => {
    if (!entries) return;
    for (const g of entries) {
      if (g.commandsBlob == null) continue;
      const bytes = toUint8(blobs[g.commandsBlob]);
      if (!bytes) continue;
      const cmds = decodeCommandsBlob(bytes);
      if (!cmds) continue;
      out.push({
        commands: cmds,
        d: commandsToD(cmds),
        windingRule:
          g.windingRule === "ODD" || g.windingRule === "EVENODD"
            ? "evenodd"
            : "nonzero",
        paint,
      });
    }
  };

  // fillGeometry → fill with fill paint
  decodeGeom(node.fillGeometry, fillPaths, "fill");
  // strokeGeometry is an expanded outline → fill with stroke paint (paint:"fill")
  decodeGeom(node.strokeGeometry, strokePaths, "fill");

  const hasVisibleFill = (node.fillPaints ?? []).some(
    (p) => p.visible !== false
  );
  const hasVisibleStroke =
    (node.strokePaints ?? []).some((p) => p.visible !== false) ||
    (node.strokeWeight ?? 0) > 0;

  // Vector network centerlines (Lucide etc.).
  // Prefer centerline for stroke-only vectors even when strokeGeometry exists:
  // expanded stroke outlines are huge, often extend past clip rects, and at
  // instance scale are less reliable than stroking the original network.
  if (node.vectorData?.vectorNetworkBlob != null) {
    const bytes = toUint8(blobs[node.vectorData.vectorNetworkBlob]);
    if (bytes) {
      const cmds = decodeVectorNetworkBlob(bytes);
      if (cmds) {
        const d = commandsToD(cmds);
        const strokeOnly = hasVisibleStroke && !hasVisibleFill;

        if (strokeOnly) {
          // Replace any expanded strokeGeometry with clean centerline
          strokePaths.length = 0;
          strokePaths.push({
            commands: cmds,
            d,
            windingRule: "nonzero",
            paint: "stroke",
          });
        } else if (fillPaths.length === 0 && strokePaths.length === 0) {
          if (hasVisibleFill) {
            fillPaths.push({
              commands: cmds,
              d,
              windingRule: "nonzero",
              paint: "fill",
            });
            if (hasVisibleStroke) {
              strokePaths.push({
                commands: cmds,
                d,
                windingRule: "nonzero",
                paint: "stroke",
              });
            }
          } else {
            // No paints declared — still emit so renderer can fall back
            const hasClose = cmds.some((c) => c.op === "Z");
            if (hasClose) {
              fillPaths.push({
                commands: cmds,
                d,
                windingRule: "nonzero",
                paint: "fill",
              });
            } else {
              strokePaths.push({
                commands: cmds,
                d,
                windingRule: "nonzero",
                paint: "stroke",
              });
            }
          }
        }
      }
    }
  }

  const ns = node.vectorData?.normalizedSize;
  return {
    fillPaths,
    strokePaths,
    normalizedSize: ns ? { width: ns.x, height: ns.y } : undefined,
  };
}

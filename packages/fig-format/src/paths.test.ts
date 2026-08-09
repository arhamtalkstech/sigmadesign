import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeCommandsBlob,
  decodeVectorNetworkBlob,
  readFigFile,
  resolveNodePaths,
  guidToString,
} from "./index.js";

/** Optional local fixture — not shipped with the product. */
const SAMPLE = resolve(import.meta.dirname, "../../../sample-figma-file.fig");

describe("path decoding", () => {
  it("decodes commandsBlob Move/Line/Close", () => {
    // M 8 0 L 10 0 Z  (hand-built)
    const bytes = new Uint8Array([
      0x01, // M
      ...new Uint8Array(new Float32Array([8, 0]).buffer),
      0x02, // L
      ...new Uint8Array(new Float32Array([10, 0]).buffer),
      0x03, // Z
    ]);
    const cmds = decodeCommandsBlob(bytes)!;
    expect(cmds[0]).toMatchObject({ op: "M", x: 8, y: 0 });
    expect(cmds[1]).toMatchObject({ op: "L", x: 10, y: 0 });
    expect(cmds[2]).toMatchObject({ op: "Z" });
  });

  it("decodes sample file vector networks (icons)", async () => {
    if (!existsSync(SAMPLE)) return;
    const decoded = await readFigFile(readFileSync(SAMPLE));
    const nodes = decoded.message.nodeChanges ?? [];
    const blobs = decoded.message.blobs ?? [];

    // Lucide user-round head+body
    const user = nodes.find((n) => guidToString(n.guid) === "1:58");
    expect(user).toBeTruthy();
    const paths = resolveNodePaths(user!, blobs);
    expect(paths.strokePaths.length + paths.fillPaths.length).toBeGreaterThan(0);
    const d = (paths.strokePaths[0] ?? paths.fillPaths[0])!.d;
    expect(d).toContain("M 13 5");
    expect(d).toContain("8 10");
    expect(d).toContain("Z");

    // Count vectors with resolvable geometry
    let ok = 0;
    for (const n of nodes) {
      if (n.type !== "VECTOR") continue;
      const r = resolveNodePaths(n, blobs);
      if (r.fillPaths.length || r.strokePaths.length) ok++;
    }
    expect(ok).toBeGreaterThan(1000);
  }, 60_000);

  it("decodes vectorNetworkBlob header", async () => {
    if (!existsSync(SAMPLE)) return;
    const decoded = await readFigFile(readFileSync(SAMPLE));
    const blobs = decoded.message.blobs ?? [];
    // blob 17 is user-round network
    const cmds = decodeVectorNetworkBlob(blobs[17]!.bytes as Uint8Array);
    expect(cmds?.length).toBeGreaterThan(5);
    expect(cmds?.[0]?.op).toBe("M");
  }, 60_000);

  it("tags strokeGeometry as fill-outline and vector-network as centerline stroke", async () => {
    if (!existsSync(SAMPLE)) return;
    const decoded = await readFigFile(readFileSync(SAMPLE));
    const nodes = decoded.message.nodeChanges ?? [];
    const blobs = decoded.message.blobs ?? [];

    // Outline button master/instance geometry (expanded stroke outline)
    const btn = nodes.find((n) => guidToString(n.guid) === "1:4394");
    expect(btn).toBeTruthy();
    const btnPaths = resolveNodePaths(btn!, blobs);
    expect(btnPaths.strokePaths.length).toBeGreaterThan(0);
    expect(btnPaths.strokePaths.every((p) => p.paint === "fill")).toBe(true);
    // Expanded outline has thickness (coords outside 0..size by ~strokeWeight/2)
    expect(btnPaths.strokePaths[0]!.d).toMatch(/-1|66|25/);

    // Plus icon master arm: centerline from vector network
    const plusArm = nodes.find((n) => guidToString(n.guid) === "1:340");
    expect(plusArm).toBeTruthy();
    const armPaths = resolveNodePaths(plusArm!, blobs);
    expect(armPaths.strokePaths.length).toBeGreaterThan(0);
    expect(armPaths.strokePaths[0]!.paint).toBe("stroke");
    expect(armPaths.strokePaths[0]!.d).toMatch(/M 0 0 L 0 /);

    // Calculator: stroke-only Lucide prefers centerline even if strokeGeometry exists
    const calcVec = nodes.find((n) => guidToString(n.guid) === "1:3630");
    expect(calcVec).toBeTruthy();
    const calcPaths = resolveNodePaths(calcVec!, blobs);
    expect(calcPaths.strokePaths.some((p) => p.paint === "stroke")).toBe(true);
    expect(calcPaths.strokePaths[0]!.d).toMatch(/M 2 0/);
  }, 60_000);
});

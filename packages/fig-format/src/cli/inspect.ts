#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readFigFile, summarizeMessage, guidToString } from "../index.js";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: fig:inspect <path-to.fig>");
    process.exit(1);
  }

  const path = resolve(file);
  const buf = readFileSync(path);
  const decoded = await readFigFile(buf);
  const summary = summarizeMessage(decoded.message);

  console.log(JSON.stringify({
    path,
    fileName: decoded.meta.file_name,
    header: decoded.header,
    meta: decoded.meta,
    ...summary,
    imageCount: decoded.images.size,
    sampleNodes: (decoded.message.nodeChanges ?? [])
      .filter((n) => n.type === "CANVAS" || n.type === "FRAME" || n.type === "TEXT")
      .slice(0, 12)
      .map((n) => ({
        id: guidToString(n.guid),
        type: n.type,
        name: n.name,
        size: n.size,
        visible: n.visible,
      })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

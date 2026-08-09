#!/usr/bin/env node
/**
 * Validate Figma REST API access for a file/node.
 * Usage: FIGMA_TOKEN=figd_... node scripts/validate-figma-api.mjs [fileKey] [nodeId]
 */
const TOKEN = process.env.FIGMA_TOKEN;
const FILE = process.argv[2] || "79vI7KhrSSPYLOZVVLC7zk";
const NODE = process.argv[3] || "1:13028";
if (!TOKEN) {
  console.error("Set FIGMA_TOKEN");
  process.exit(1);
}
const url = `https://api.figma.com/v1/files/${FILE}/nodes?ids=${encodeURIComponent(NODE)}`;
const res = await fetch(url, { headers: { "X-Figma-Token": TOKEN } });
const data = await res.json();
if (!res.ok) {
  console.error(data);
  process.exit(1);
}
const root = data.nodes[NODE]?.document;
let n = 0;
function walk(node, depth = 0) {
  n++;
  const bb = node.absoluteBoundingBox;
  if (depth < 3) {
    console.log(
      "  ".repeat(depth) +
        `${node.type} ${node.name} ${bb ? `${bb.width}x${bb.height} @(${bb.x},${bb.y})` : ""}`
    );
  }
  for (const c of node.children || []) walk(c, depth + 1);
}
walk(root);
console.log("total nodes", n);

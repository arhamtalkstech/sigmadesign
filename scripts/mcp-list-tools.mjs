#!/usr/bin/env node
/**
 * Smoke-launch the MCP tool registry twice (without long-lived stdio).
 * Proves the entry module loads and exposes the documented tool names.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const toolsPath = join(root, "apps/web/src/mcp/tools.ts");

async function loadOnce(label) {
  // Dynamic import of TS via tsx when run as: pnpm exec tsx scripts/mcp-list-tools.mjs
  const mod = await import(pathToFileURL(toolsPath).href);
  const names = mod.listToolNames();
  console.log(`[${label}] toolCount=${names.length}`);
  console.log(`[${label}] tools=${names.join(",")}`);
  if (!names.length) {
    throw new Error("empty tool list");
  }
  const required = [
    "list_library_files",
    "get_design_context",
    "get_screenshot",
    "create_rectangle",
    "update_node",
  ];
  for (const r of required) {
    if (!names.includes(r)) throw new Error(`missing tool: ${r}`);
  }
  return names;
}

const a = await loadOnce("run-1");
const b = await loadOnce("run-2");
if (a.join() !== b.join()) {
  throw new Error("tool lists differ across launches");
}
console.log("OK: consistent non-empty tool registry");

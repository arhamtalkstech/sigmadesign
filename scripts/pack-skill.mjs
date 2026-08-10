#!/usr/bin/env node
/**
 * Package skills/sigmadesign-implement into apps/web/public/skills/*.zip
 * for download from the Connect page.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
} from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const skillDir = join(root, "skills", "sigmadesign-implement");
const outDir = join(root, "apps", "web", "public", "skills");
const outZip = join(outDir, "sigmadesign-implement.zip");

function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, base, acc);
    else acc.push({ abs: p, rel: relative(base, p) });
  }
  return acc;
}

async function main() {
  if (!existsSync(skillDir)) {
    console.error("Missing skill dir:", skillDir);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  // Prefer archiver if present; else minimal ZIP via jszip from fig-format deps
  let JSZip;
  try {
    JSZip = (await import("jszip")).default;
  } catch {
    // resolve from workspace
    const jszipPath = require.resolve("jszip", {
      paths: [join(root, "packages", "fig-format")],
    });
    JSZip = require(jszipPath);
  }

  const zip = new JSZip();
  const files = walk(skillDir);
  for (const f of files) {
    zip.file(`sigmadesign-implement/${f.rel}`, readFileSync(f.abs));
  }
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outZip, buf);
  console.log("Wrote", outZip, `(${buf.length} bytes, ${files.length} files)`);
  for (const f of files) console.log(" -", f.rel);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

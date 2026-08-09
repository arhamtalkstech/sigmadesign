export { importFigFile, decodedFigToDocument, buildChildMap } from "./import.js";
export { mapFigNode, mapNodeType } from "./map-node.js";
export { expandAllInstances } from "./expand-instances.js";
// validate-parity is Node-only (fs + fetch oracle) — import from
// "@alteron/fig-import/src/validate-parity" in tests/scripts, not the browser bundle.

/**
 * Browser-safe catalog of agent tools (names + descriptions only).
 * Do NOT import server/library code here — Connect page is a client surface.
 */
export const TOOL_CATALOG = [
  {
    name: "list_library_files",
    description:
      "List all design files in the local SigmaDesign library (~/.sigmadesign).",
  },
  {
    name: "get_library_info",
    description: "Return library home path and summary counts.",
  },
  {
    name: "open_document",
    description:
      "Open a library file by id and return document summary (pages, node count, styles, variables).",
  },
  {
    name: "get_design_context",
    description:
      "Get structured design context for a node and its subtree (structure, paints, text, layout). Primary tool for implementing UI from a design.",
  },
  {
    name: "get_node",
    description: "Get a single node by id with full property summary.",
  },
  {
    name: "search_layers",
    description: "Search layers by name and/or type within a document.",
  },
  {
    name: "list_pages",
    description: "List pages in a document with child root ids.",
  },
  {
    name: "list_components",
    description: "List components registered on a document.",
  },
  {
    name: "get_styles",
    description: "List shared styles (fills, text, effects) on a document.",
  },
  {
    name: "get_variables",
    description:
      "List design variables, collections, and active modes for theming/tokens.",
  },
  {
    name: "get_comments",
    description: "List design comments/pins on a document.",
  },
  {
    name: "get_screenshot",
    description:
      "Export a node or page region as PNG (base64). Prefer for visual verification after implementing UI.",
  },
  {
    name: "export_node_json",
    description:
      "Export a node subtree as compact JSON suitable for codegen handoff.",
  },
  {
    name: "update_node",
    description:
      "Patch node properties (name, size, opacity, visible, characters, fills, etc.) and persist to library.",
  },
  {
    name: "create_rectangle",
    description:
      "Create a rectangle on the current page (beyond typical design-tool MCP read APIs).",
  },
  {
    name: "create_text",
    description: "Create a text layer on the current page.",
  },
  {
    name: "set_node_auto_layout",
    description:
      "Set managed auto-layout mode on a frame (HORIZONTAL/VERTICAL/NONE).",
  },
  {
    name: "rename_node",
    description: "Rename a layer and persist.",
  },
  {
    name: "get_code_hints",
    description:
      "Return implementation hints for a node: suggested HTML structure, CSS tokens from fills/text, and layout notes for coding agents.",
  },
] as const;

export type ToolCatalogEntry = (typeof TOOL_CATALOG)[number];

export function listCatalogToolNames(): string[] {
  return TOOL_CATALOG.map((t) => t.name);
}

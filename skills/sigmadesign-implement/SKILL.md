---
name: sigmadesign-implement
description: >
  Implement production UI from SigmaDesign local library files via the
  SigmaDesign MCP tools. Use when building screens from a design open in
  SigmaDesign, mapping layers/tokens to code, or verifying layout against
  design context without third-party design-cloud rate limits.
---

# Implement UI from SigmaDesign

You are implementing application UI from **local SigmaDesign** files. Designs
live under `~/.sigmadesign` (or `SIGMADESIGN_HOME`). Connect through the
**sigmadesign** MCP server — not a remote design cloud.

## When to use

- User has a SigmaDesign library file and wants coded UI
- You need structure, paints, text, layout, tokens, or screenshots from a design
- Figma/public design MCP limits or auth would block you

## Prerequisites

1. SigmaDesign monorepo installed; library contains at least one `.sig` file
2. MCP client configured (see `configs/mcp.example.json`)
3. Server started via `pnpm mcp` from the repo root

## Required workflow

### 1. Discover files

```
list_library_files
get_library_info
```

Pick a `fileId` from the list (stable library id, not the display name alone).

### 2. Open and orient

```
open_document { fileId }
list_pages { fileId }
```

Choose a page / root frame. Prefer non-internal pages.

### 3. Locate the target UI

```
search_layers { fileId, query: "Hero" | screen name }
get_node { fileId, nodeId }
```

### 4. Obtain full design context

```
get_design_context { fileId, nodeId, depth: 4–8 }
get_styles { fileId }
get_variables { fileId }
get_code_hints { fileId, nodeId, depth: 2 }
```

Use `get_design_context` as the primary payload for structure, paints, text, and layout.
Use styles/variables for design tokens. Use `get_code_hints` for flex/tag suggestions.

Optional visual ground truth:

```
get_screenshot { fileId, nodeId, scale: 1 }
export_node_json { fileId, nodeId, depth: 6 }
```

### 5. Map design → code

| Design | Implementation |
| --- | --- |
| `FRAME` + auto layout HORIZONTAL/VERTICAL | flex row/column; gap + padding from layout |
| `TEXT` + textStyle | typography (family, size, weight, align) |
| Solid fills | background-color / color tokens |
| Image fills | `<img>` or CSS background; hash is local asset id |
| `cornerRadius` | border-radius |
| opacity / blendMode | CSS opacity / mix-blend-mode |
| INSTANCE / COMPONENT | reusable component; check `list_components` |
| Variables / styles | theme tokens; resolve active modes |

Rules:

- Prefer semantic components over one giant nested div soup
- Match spacing from layout.gap / padding and absoluteBounds deltas
- Do not invent colors; use fills/variables from context
- Nested frames that only group → fragment or layout wrapper

### 6. Implement

Write production-quality UI for the stack the user requested (React, HTML, etc.).
Keep accessibility (labels, contrast, focus) in mind.

### 7. Verify

```
get_design_context { fileId, nodeId }   # re-check structure
get_screenshot { fileId, nodeId }       # when pixel export works
```

Compare hierarchy, copy, spacing, and colors. Fix gaps.

## Write tools (local library)

Beyond read-only cloud MCPs you can also:

| Tool | Use |
| --- | --- |
| `update_node` | Patch name, size, opacity, fills, text |
| `create_rectangle` / `create_text` | Scaffold annotations or placeholders |
| `set_node_auto_layout` | Managed flex on a frame |
| `rename_node` | Clean layer names before handoff |

Only mutate the local library the user owns.

## Tool catalog (quick)

- `list_library_files`, `get_library_info`, `open_document`
- `list_pages`, `list_components`, `search_layers`
- `get_node`, `get_design_context`, `export_node_json`, `get_code_hints`
- `get_styles`, `get_variables`, `get_comments`
- `get_screenshot`
- `update_node`, `rename_node`, `create_rectangle`, `create_text`, `set_node_auto_layout`

## Anti-patterns

- Do not call remote design-cloud APIs for files already in SigmaDesign
- Do not skip `get_design_context` and guess layout from a single screenshot
- Do not hard-code magic spacing when layout fields exist
- Do not put connection setup UI copy into the product canvas (user-facing)

## Config

See `configs/mcp.example.json` and `configs/claude-desktop.example.json`.

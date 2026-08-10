# SigmaDesign agent tool catalog

All tools operate on the **local** library (`SIGMADESIGN_HOME` / `~/.sigmadesign`).

## Discovery

| Tool | Purpose |
| --- | --- |
| `list_library_files` | List library ids, names, node counts |
| `get_library_info` | Home path + aggregate counts |
| `open_document` | Document summary (pages, counts, tokens) |
| `list_pages` | Pages and root child ids |
| `list_components` | Component registry |
| `search_layers` | Find nodes by name/type |

## Read design

| Tool | Purpose |
| --- | --- |
| `get_node` | Single node property dump |
| `get_design_context` | Subtree structure for implementation |
| `export_node_json` | Compact JSON handoff |
| `get_code_hints` | Tag/flex/token suggestions |
| `get_styles` | Shared styles |
| `get_variables` | Variables + modes |
| `get_comments` | Comment pins |
| `get_screenshot` | PNG (base64) when canvas export is available |

## Write (local)

| Tool | Purpose |
| --- | --- |
| `update_node` | Patch properties + save |
| `rename_node` | Rename layer |
| `create_rectangle` | Add rectangle |
| `create_text` | Add text |
| `set_node_auto_layout` | Managed auto-layout |

## Recommended sequence for coding

1. `list_library_files` → pick `fileId`  
2. `search_layers` / `list_pages` → pick root frame  
3. `get_design_context` + `get_styles` + `get_variables`  
4. `get_code_hints`  
5. Implement  
6. `get_screenshot` or re-fetch context to verify  

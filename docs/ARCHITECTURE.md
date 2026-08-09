# SigmaDesign — Architecture

## Goals

1. **Local-first** — designs and library state stay on the user’s machine.  
2. **Import once, reopen fast** — decode archives into an intermediate scene graph (ADM), cache it, reopen from SQLite + disk.  
3. **High-fidelity canvas** — path geometry, instance expansion, images, text, and effects close to the authored design.  
4. **Product brand** — user-facing product is **SigmaDesign**; file extension **`.sig`**.

## High-level flow

```
┌─────────────┐     import      ┌──────────────────────┐
│  .fig / .sig│ ──────────────► │  fig-format (decode) │
└─────────────┘                 └──────────┬───────────┘
                                           │
                                           ▼
                                ┌──────────────────────┐
                                │ fig-import           │
                                │  • map nodes → ADM   │
                                │  • expand instances  │
                                │  • resolve paths     │
                                │  • attach images     │
                                └──────────┬───────────┘
                                           │
                     ┌─────────────────────┼─────────────────────┐
                     ▼                     ▼                     ▼
            ~/.sigmadesign/         SQLite index           ADM JSON cache
              library/{id}.sig      (metadata, session)    cache/{id}.adm.json
                     │                     │                     │
                     └─────────────────────┴─────────────────────┘
                                           │
                                           ▼
                                ┌──────────────────────┐
                                │ apps/web             │
                                │  /          library  │
                                │  /file/[id] editor   │
                                │  render-engine canvas│
                                └──────────────────────┘
```

## Packages

### `packages/fig-format`

- Unpacks ZIP design archives (`canvas.fig` + `meta.json` + `images/*`).  
- Decodes **fig-kiwi** / kiwi schema messages.  
- Path decoding: `commandsBlob`, `vectorNetworkBlob` → SVG path `d` strings.  
- Clipboard helpers for kiwi-buffered HTML paste payloads.

### `packages/document-model`

- **ADM** (Alteron Document Model): typed scene graph.  
- Absolute transforms (4-corner AABB).  
- Careful auto-layout: only synthetic instance subtrees are reflowed so authored layout stays intact.

### `packages/fig-import`

- `importFigFile` → full `AlteronDocument`.  
- **Instance expansion**: clones symbol masters under instances (ids `99:…`).  
- **Component properties**: text, visibility, **instance swap** (`OVERRIDDEN_SYMBOL_ID`) for icon slots.  
- **derivedSymbolData**: size/transform/geometry overrides with full guidPath resolution (avoids collapsing menu rows).  
- Vector paths tagged `paint: "fill" | "stroke"` (expanded outline vs centerline).

### `apps/web`

| Layer | Responsibility |
| --- | --- |
| `app/` | Routes `/`, `/file/[id]`, library APIs |
| `server/` | SQLite, paths under `SIGMADESIGN_HOME`, ADM cache |
| `store/` | Zustand document state, open/import, session |
| `lib/render-engine.ts` | Canvas render: culling, paths, images, text, shadows |
| `components/` | Shell UI (TopBar, Layers, Canvas, …) |

## Rendering notes

- **strokeGeometry** → fill with stroke paint (never restroke outlines).  
- **Lucide / stroke-only vectors** → prefer vector-network **centerlines** + canvas `stroke()`.  
- **Images** → paint order bottom→top; blend modes (e.g. multiply for QR); safe clip; no white silhouette over photos.  
- **Drop shadows** → stacked multi-shadow; silhouette when geometry exists without fills.  
- **Clipping** → only when `clipsContent === true` (from `frameMaskDisabled` inversion).

## Caching

`ADM_CACHE_VERSION` in `library-service.ts` must be bumped whenever import or path semantics change so disk caches rebuild.

## Security / privacy

- No required cloud auth.  
- Library and caches are local.  
- Do not commit `.env`, tokens, or user library data (see `.gitignore`).

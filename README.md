# SigmaDesign

**SigmaDesign** is a local-first design editor. Import a design archive once, keep it as **`.sig`** in your machine library, and reopen from disk — no cloud seats, no accounts required for the core workflow.

---

## Why SigmaDesign

| Principle | What you get |
| --- | --- |
| **Local-first** | Library, session, and caches live under `~/.sigmadesign` (configurable). |
| **Stable URLs** | `/file/{id}` always opens the same library file. |
| **Import once** | Decode → expand components → cache ADM JSON for fast reopen. |
| **High-fidelity canvas** | Vectors, Lucide-style icons, images (including QR codes), text, and shadows. |
| **Own your files** | `.sig` is your library format; you can still import compatible `.fig` archives. |

---

## Quick start

**Requirements:** Node.js ≥ 20, [pnpm](https://pnpm.io) 9.x

```bash
pnpm install
pnpm dev
```

Open **http://localhost:3000**

```bash
# alternate port
pnpm dev:3010   # → http://localhost:3010
```

### First five minutes

1. Open `/` — library home.  
2. Click **Import design file** (or drop a `.sig` / `.fig` on the page).  
3. You land on `/file/{id}` with layers, canvas, and properties.  
4. Pan (space+drag / scroll), zoom (ctrl+wheel), select layers.  
5. Return home with the brand control in the top bar.

More detail: **[docs/USAGE.md](./docs/USAGE.md)**.

---

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Library list only (never the canvas) |
| `/file/{id}` | Editor for library file `id` |
| `/?resume=1` | Reopen last file from SQLite |

---

## Local data

```
~/.sigmadesign/              # or $SIGMADESIGN_HOME
  sigmadesign.db             # SQLite: files, viewport, last opened
  library/
    {id}.sig                 # design files
  cache/
    {id}.adm.json            # decoded scene graph (versioned)
  thumbnails/                # reserved
```

Session state (viewport, page, selection, expanded layers) is saved while you work.

---

## Monorepo map

```
apps/web                   Next.js app — UI + library API + canvas
packages/document-model    Scene graph types, transforms, layout helpers
packages/fig-format        Design-archive ZIP + kiwi codec + path blobs
packages/fig-import        Archive → ADM + instance expansion + path resolve
docs/                      Usage, architecture, development
```

Deep dives:

- [Usage](./docs/USAGE.md)  
- [Architecture](./docs/ARCHITECTURE.md)  
- [Development](./docs/DEVELOPMENT.md)  
- [Contributing](./CONTRIBUTING.md)

---

## Architecture (short)

```
.fig / .sig  →  import once  →  ~/.sigmadesign/library/{id}.sig
                              →  SQLite metadata + session
                              →  cache/{id}.adm.json  (ADM scene graph)
                                         ↓
                              /file/{id}  canvas · layers · properties
```

**ADM** = internal scene document (nodes, paints, paths, assets).  
**Instance expansion** materializes component trees so the canvas draws real icons, menus, and buttons.  
**Render engine** uses Path2D caches, viewport culling, image decode, multi-shadow, and blend modes.

---

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server (port 3000) |
| `pnpm dev:3010` | Dev server (port 3010) |
| `pnpm test` | All package tests |
| `pnpm typecheck` | TypeScript across workspace |
| `pnpm build` | Production build |
| `pnpm fig:inspect` | CLI inspect a design archive |

---

## File formats

| Extension | Meaning |
| --- | --- |
| **`.sig`** | SigmaDesign library file (recommended). |
| **`.fig`** | Compatible design archive; imported and stored as `.sig`. |

Archives are ZIP packages: kiwi-encoded scene graph, blobs, and `images/*` bitmaps.

---

## Environment

| Variable | Description |
| --- | --- |
| `SIGMADESIGN_HOME` | Override library root (default `~/.sigmadesign`) |

Copy `.env.example` → `.env.local` if needed. **Never commit secrets.**

---

## Security & privacy

- No required third-party auth for core local use.  
- Design data and SQLite stay on disk under `SIGMADESIGN_HOME`.  
- `.gitignore` excludes `.env*`, keys, DB files, ADM caches, and runtime library data.  
- Do not commit private design files or API tokens.

---

## Tests

```bash
pnpm test
```

Includes path/geometry regression, instance-swap icons, sidebar layout, routes/brand, and UI chrome checks.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Roadmap ideas

- Thumbnails for library cards  
- Export `.sig` / PNG  
- Multi-page switcher UI  
- Performance profiling for 50k+ node files  
- Optional cloud sync (out of scope for v0 core)

---

**SigmaDesign** — your designs, on your machine.

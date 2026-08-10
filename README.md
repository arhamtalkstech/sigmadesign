# SigmaDesign

**Local-first design editor.** Import a design archive once, keep it as **`.sig`** on your machine, and reopen anytime — no cloud seats, no accounts required for the core workflow.

> **Who this is for:** developers and technical designers who can run a Node app from source. This is not a double-click desktop installer (yet). If you have Node 20 + pnpm — or Docker — you can run it.

<p align="center">
  <img src="docs/screenshots/canvas-portfolio.jpg" alt="SigmaDesign canvas showing an imported product portfolio design" width="920" />
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/get_started-pnpm_dev-6b70e8?style=for-the-badge" alt="Get started" /></a>
  <a href="https://github.com/arhamtalkstech/sigmadesign"><img src="https://img.shields.io/badge/GitHub-sigmadesign-181717?style=for-the-badge&logo=github" alt="GitHub" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=nextdotjs" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License" />
</p>

---

## Why SigmaDesign

| | |
| --- | --- |
| **Local-first** | Library, session, and caches live under `~/.sigmadesign` (configurable). |
| **Import once** | Decode → expand components → open from disk in milliseconds. |
| **High-fidelity canvas** | Vectors, icons, images, text, shadows, blend modes. |
| **Authoring tools** | Frames, shapes, pen, resize/rotate, snap, booleans, auto layout. |
| **Own your files** | `.sig` library format; still imports compatible `.fig` archives. |

---

## Screenshots

| Library home | Canvas | Design panel |
| :----------: | :----: | :----------: |
| <img src="docs/screenshots/library-home.jpg" alt="Library home with local .sig files" width="280" /> | <img src="docs/screenshots/canvas-portfolio.jpg" alt="Canvas editor" width="280" /> | <img src="docs/screenshots/design-panel.jpg" alt="Selection handles and design properties" width="280" /> |
| Private local library — drop `.sig` / `.fig` or create a blank file | High-fidelity scene with layers, tools, and auto-save | Transform, fill, stroke, components, styles, variables |

<p align="center">
  <img src="docs/screenshots/library-home.jpg" alt="SigmaDesign library home" width="820" />
</p>

<p align="center">
  <img src="docs/screenshots/design-panel.jpg" alt="SigmaDesign design panel and selection" width="820" />
</p>

---

## Features

- **Import** design archives (`.fig` / `.sig`) into a private library with stable `/file/{id}` URLs  
- **Canvas** with pan, zoom, hit-testing, selection handles, and resize / rotate  
- **Tools** — move, hand, frame, rectangle, ellipse, text, pen, image place, comments  
- **Clipboard paste** from design tools (with warning when image bytes are missing)  
- **Auto-save** full document writeback into self-contained `.sig` files  
- **Design system basics** — components, instances, fill styles, color variables, modes  
- **Export PNG** of the page or current selection  
- **Local coding agents** — connect machine agents to your library (see [Agents](#agents-coding-assistants))  
- **No cloud required** for the core path  

---

## Prerequisites

| Requirement | Notes |
| --- | --- |
| **Node.js ≥ 20** | [nodejs.org](https://nodejs.org/) or your package manager |
| **pnpm 9.x** | Enable with Corepack (ships with Node): see below |
| **Build tools for native modules** | `better-sqlite3` compiles on install (see OS notes) |

### Install pnpm (recommended: Corepack)

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --version   # should print 9.x
```

If Corepack is unavailable: `npm install -g pnpm@9`

### Native module build tools

`pnpm install` builds **better-sqlite3**. You need a C/C++ toolchain:

| OS | What to install |
| --- | --- |
| **macOS** | Xcode Command Line Tools: `xcode-select --install` |
| **Ubuntu / Debian** | `sudo apt-get install -y build-essential python3` |
| **Fedora** | `sudo dnf groupinstall "Development Tools"` + `python3` |
| **Windows** | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with “Desktop development with C++”, plus Python 3 |

**Optional:** `canvas` (used for some PNG/agent screenshot paths) may need extra system libs on Linux (`libcairo2-dev`, `libpango1.0-dev`, etc.). The editor runs without a successful `canvas` install; only some export/agent screenshot features degrade.

---

## Quick start

### Option A — local Node (primary)

```bash
git clone https://github.com/arhamtalkstech/sigmadesign.git
cd sigmadesign
pnpm install
pnpm dev
```

Open **http://localhost:3000**

```bash
# alternate port
pnpm dev:3010   # → http://localhost:3010
```

### Option B — Docker (hides Node/native setup)

Requires [Docker](https://docs.docker.com/get-docker/) + Docker Compose.

```bash
git clone https://github.com/arhamtalkstech/sigmadesign.git
cd sigmadesign
docker compose up --build
```

Open **http://localhost:3000**

Library data persists in the Docker volume `sigmadesign-data` (not your host `~/.sigmadesign` unless you change the compose file).

Stop with `Ctrl+C`, or run detached: `docker compose up --build -d`.

### First five minutes

1. Open `/` — your library home  
2. **Import design file** (or drop a `.sig` / `.fig`)  
3. Land on `/file/{id}` — layers, canvas, design panel  
4. Pan (space + drag / scroll), zoom (ctrl + wheel), select and edit  
5. Return home via the brand control in the top bar  

More detail: **[docs/USAGE.md](./docs/USAGE.md)**

---

## Agents (coding assistants)

Local agents can read (and optionally edit) your library **without a third-party design-cloud token**.

| | |
| --- | --- |
| **In the app** | Open **Agents** from the library header or editor top bar → **`/connect`** |
| **On the machine** | From the repo root: `pnpm mcp` |
| **Skill pack** | Download the implement skill zip from `/connect` |

Setup instructions, tool list, and config snippets live on the **Agents** page — not on the design canvas.

---

## Troubleshooting

### `pnpm install` fails on `better-sqlite3` / `node-gyp`

- Confirm Node ≥ 20: `node -v`  
- Install OS build tools (table above)  
- Retry: `pnpm install`  
- Nuclear option: delete `node_modules` and the pnpm store entry, then reinstall  
- Or skip native host setup entirely: use **Docker** (`docker compose up --build`)

### `pnpm: command not found`

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
```

### Port 3000 already in use

```bash
pnpm dev:3010
# or
PORT=3001 pnpm dev
```

### App starts but library is empty

Expected on first run. Import a `.fig` / `.sig`, or use **New blank file**.  
Data directory: `~/.sigmadesign` (or `$SIGMADESIGN_HOME`).

### Changes after import don’t stick / file looks empty after reload

- Wait for status **Saved · N nodes** after edits  
- Confirm you are opening the same library entry under `/file/{id}`  
- Check disk space under `SIGMADESIGN_HOME`

### Docker: page won’t load

- Wait until logs show Next is ready  
- Open `http://localhost:3000` (not only the container hostname)  
- `docker compose logs -f` for build/runtime errors  

### Typecheck / build fails after pull

```bash
pnpm install
pnpm test
pnpm build
```

Still stuck? Open an issue with OS, `node -v`, `pnpm -v`, and the full error log.

---

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Library list only (never the canvas) |
| `/file/{id}` | Editor for library file `id` |
| `/connect` | Agents setup, tools, skill download |
| `/?resume=1` | Reopen last file from SQLite |

---

## Local data

```text
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

## Monorepo

```text
apps/web                   Next.js app — UI + library API + canvas + agent server
packages/document-model    Scene graph types, transforms, authoring ops
packages/fig-format        Design-archive ZIP + kiwi codec + path blobs
packages/fig-import        Archive → ADM + instance expansion + path resolve
docs/                      Usage, architecture, development, screenshots
skills/                    Agent skill source (packaged to public zip)
```

Deep dives:

- [Usage](./docs/USAGE.md)  
- [Architecture](./docs/ARCHITECTURE.md)  
- [Development](./docs/DEVELOPMENT.md)  
- [Contributing](./CONTRIBUTING.md)

---

## Architecture (short)

```text
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
| `pnpm mcp` | Start local agent server (stdio) |
| `pnpm skill:pack` | Rebuild skill zip for `/connect` download |
| `pnpm fig:inspect` | CLI inspect a design archive |
| `docker compose up --build` | Run via Docker |

---

## File formats

| Extension | Meaning |
| --- | --- |
| **`.sig`** | SigmaDesign library file (recommended). |
| **`.fig`** | Compatible design archive; imported and stored as `.sig`. |

Archives are ZIP packages: kiwi-encoded scene graph, blobs, and `images/*` bitmaps. Edited library files may also store self-contained ADM JSON after the `SIGMABLANK` header for reliable writeback.

---

## Environment

| Variable | Description |
| --- | --- |
| `SIGMADESIGN_HOME` | Override library root (default `~/.sigmadesign`) |

Copy `.env.example` → `.env.local` if needed. **Never commit secrets.**

---

## Security & privacy

- No required third-party auth for core local use  
- Design data and SQLite stay on disk under `SIGMADESIGN_HOME`  
- `.gitignore` excludes `.env*`, keys, DB files, ADM caches, and runtime library data  
- Do not commit private design files or API tokens  

---

## Tests

```bash
pnpm test
```

Includes document-model authoring tests, path/geometry regression, instance-swap icons, routes/brand, UI chrome, agent tool handlers, and `.sig` writeback round-trips.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Roadmap ideas

- Thumbnails for library cards  
- Multi-page switcher UI  
- Deeper Bezier / boolean computational geometry  
- Performance profiling for 50k+ node files  
- Optional cloud sync (out of scope for core local workflow)

---

<p align="center">
  <strong>SigmaDesign</strong> — your designs, on your machine.
</p>

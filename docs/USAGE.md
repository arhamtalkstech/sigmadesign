# SigmaDesign — How to use

## Install and run

```bash
pnpm install
pnpm dev
```

Open **http://localhost:3000**.

Optional fixed port:

```bash
pnpm dev:3010
```

## Library home (`/`)

The home screen is your **local library only** — not the canvas.

| Action | Result |
| --- | --- |
| **New blank file** | Creates an empty canvas. On the canvas, paste design layers with **Ctrl/Cmd+V** (after copying from a design tool). |
| **Import design file** | Choose a `.sig` or `.fig` archive. SigmaDesign stores a `.sig` copy under `~/.sigmadesign/library/` and opens `/file/{id}`. |
| **Drop zone** | Drag-and-drop a design archive onto the home drop area. |
| **Click a file card** | Opens `/file/{id}` with that document. |
| **Remove** | Deletes the library entry and cached ADM (does not affect originals outside the library). |

### Paste workflow

1. Home → **New blank file** (or open any file).  
2. In your design tool: select layers → **Copy**.  
3. Focus the SigmaDesign canvas → **Ctrl/Cmd+V**.  

Clipboard payloads that embed a full kiwi schema paste without extra setup. If paste says a schema is missing, import any `.fig` / `.sig` once in the same browser session (schema is cached for later pastes into blank files).

Data lives on your machine only (`SIGMADESIGN_HOME` overrides the default `~/.sigmadesign`).

## Editor (`/file/{id}`)

| Area | Role |
| --- | --- |
| **Top bar** | Brand, back to library, zoom, status |
| **Tool rail** | Selection / pan tools |
| **Layers** | Scene hierarchy |
| **Canvas** | High-performance canvas render of the design |
| **Properties** | Selection summary |
| **Context menu** | Right-click design actions (copy/delete/bring forward, …) |

### Navigation

- **Pan** — space + drag, or middle mouse, or two-finger scroll  
- **Zoom** — pinch / ctrl+wheel  
- **Select** — click a layer; selection outline appears  

### Session memory

Viewport, page, selection, and expanded layers are written to SQLite while you work, so reopening `/file/{id}` restores context.

## File formats

| Extension | Role |
| --- | --- |
| **`.sig`** | SigmaDesign library format (design archive). |
| **`.fig`** | Compatible design archive you can import. Stored as `.sig` after import. |

Both are ZIP containers with a kiwi-encoded scene graph and embedded images.

## Keyboard / paste

- Design-clipboard paste is supported when the payload includes a recognized kiwi buffer marker.  
- Browser zoom (ctrl±) is blocked on the canvas so wheel zoom stays in the editor.

## Environment

| Variable | Meaning |
| --- | --- |
| `SIGMADESIGN_HOME` | Root directory for library DB, `.sig` files, and ADM cache |

See `.env.example`.

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| File looks outdated after a code update | Hard reload; import cache version may rebuild on open |
| Missing images | Confirm the archive includes an `images/` folder; re-import the file |
| Slow first open | First import expands all component instances (large files can take a few seconds); later opens use ADM cache |
| Blank canvas | Check that a non-internal page exists; zoom to fit content |

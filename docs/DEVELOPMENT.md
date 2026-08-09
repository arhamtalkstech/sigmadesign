# SigmaDesign — Development guide

## Monorepo

```
sigmadesign/
  apps/web/                 Next.js 15 app
  packages/
    document-model/         Scene graph types + layout helpers
    fig-format/             Archive codec + path blobs
    fig-import/             Import pipeline + instance expansion
  docs/                     Human docs
  scripts/                  Optional tooling
```

Workspace tooling: **pnpm** workspaces + TypeScript project references style imports via package `main` pointing at `src`.

## Local library

Default root: `~/.sigmadesign`

```
~/.sigmadesign/
  sigmadesign.db      SQLite
  library/*.sig       Design files
  cache/*.adm.json    Decoded documents (versioned)
  thumbnails/         Reserved
```

Override with `SIGMADESIGN_HOME`.

## Import pipeline (for contributors)

1. `readFigFile` — unpack ZIP / fig-kiwi.  
2. `expandAllInstances` — materialize symbol trees.  
3. `mapFigNode` + `resolveNodePaths` — ADM nodes + path paint tags.  
4. `finalizeLayout` — absolute transforms.  
5. Persist `.sig` + ADM cache + SQLite row.

When changing path paint tags, instance swaps, or layout rules: **bump `ADM_CACHE_VERSION`**.

## Render pipeline

`renderScene(ctx, doc, viewport, w, h)`:

1. Viewport culling + depth/draw budgets.  
2. Per-node: effects → fills (images + geometry) → strokes → children (optional clip).  
3. Async image loads call `onImageLoad` → canvas rAF redraw.

## Testing

```bash
pnpm test
# or per package:
pnpm --filter @alteron/fig-format test
pnpm --filter @alteron/fig-import test
pnpm --filter @alteron/web test
```

Notable regression suites:

- `icon-swap.test.ts` — CMDK icon instance swaps  
- `sidebar-layout.test.ts` — derivedSymbolData must not crush menu rows  
- `paths.test.ts` — stroke outline vs centerline tagging  
- `routes-and-brand.test.ts` — no third-party product names in UI strings  

## Optional local sample (not shipped)

For deep fidelity tests, place a design archive at the repo root as
`sample-figma-file.fig` (gitignored). Tests that need it skip when absent.
Do not commit large private design files.

## Debugging import

```bash
pnpm fig:inspect path/to/file.fig
```

Or temporary scripts under `/tmp` with `tsx` importing workspace packages (see existing tests for patterns).

## Comments & style

- Prefer clear module headers on non-obvious files (import expansion, render engine, library service).  
- Keep user-visible strings product-branded (**SigmaDesign**).  
- Internal format names (`fig-kiwi`, clipboard markers) may remain technical in code and tests.

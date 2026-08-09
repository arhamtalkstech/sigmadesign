# Contributing to SigmaDesign

Thanks for helping improve SigmaDesign.

## Prerequisites

- **Node.js** ≥ 20  
- **pnpm** 9.x (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)

## Setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the web app (port 3000) |
| `pnpm dev:3010` | Same on port 3010 |
| `pnpm test` | Run all package tests |
| `pnpm typecheck` | TypeScript across the monorepo |
| `pnpm build` | Production build |

## Package layout

- `apps/web` — Next.js editor + library API  
- `packages/document-model` — scene graph (ADM)  
- `packages/fig-format` — design-archive codec (ZIP + kiwi)  
- `packages/fig-import` — archive → ADM + instance expansion  

## Coding guidelines

1. **User-facing copy** must say **SigmaDesign** only — never third-party product names.  
2. Prefer small, focused diffs; keep render/import changes covered by tests when practical.  
3. Bump `ADM_CACHE_VERSION` in `library-service.ts` when import semantics change.  
4. Do not commit secrets, library data under `~/.sigmadesign`, or large generated caches.

## Pull requests

- Describe **what** changed and **why**.  
- Note any cache-version bumps or sample-file requirements.  
- Ensure `pnpm test` passes.

## Security

- Never commit `.env`, tokens, or private design files you do not own.  
- Report sensitive issues privately to the maintainers when possible.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Seed Cracker: instructions for coding agents

Seed Cracker finds a Minecraft: Java Edition world seed from structure positions, entirely in the browser (Next.js, React, shadcn/ui, Web Workers, WebAssembly, WebGPU). Read [README.md](README.md) for what it does and how, and [CONTRIBUTING.md](CONTRIBUTING.md) for the rules humans follow. The points below are the ones agents most often get wrong.

## Commands

```bash
npm run dev            # http://localhost:3000
npm test               # tsx scripts/test-cracker.ts (1-2 minutes)
npm run lint
npx tsc --noEmit
npm run build
scripts/build-wasm.sh  # after editing search.c or biomes.c (biomes needs wasi-libc, wasi-compiler-rt)
docker compose up -d --build   # production image (Dockerfile, standalone output)
```

`next.config.ts` sets `output: "standalone"`; the Dockerfile depends on it. If you add files the server reads at runtime, check they end up in `.next/standalone` (or copy them in the Dockerfile).

Run tests, lint, type check and build before saying a change is done. Report failures as they are.

## Layout

- `src/lib/minecraft`: game facts (Random, structures, placement, world seeds). No browser APIs.
- `src/lib/cracker`: the algorithm (observations, lifting, LCG, strategy, search, cost, plan, verify). No browser APIs.
- `src/lib/engines`: WebAssembly (`wasm/`), WebGPU (`gpu/`), biome engine (`biomes/`: vendored cubiomes plus `biomes.c`), CPU and biome worker pools, GPU worker client.
- `src/lib/crack`: the `useCracker` hook, status types, result checking, speed models.
- `src/lib/input`: form entries, paste parser, analysis and verdicts, formatting, saved form.
- `src/lib/exports`: TXT, PDF and Excel downloads.
- `src/workers`: CPU search, GPU search and download workers.
- `src/components/cracker`, `src/components/results`, `src/components/generator`, `src/components/nav`: UI. `src/components/ui`: shadcn.

Import from a folder's `index.ts`. Exception: `src/workers/export.worker.ts` imports `lib/exports` modules directly, because the `lib/exports` barrel starts that worker.

## Correctness rules

- Never let a fast path drift from the reference. `searchRangeReference` and the BigInt `JavaRandom` are the source of truth. JS (`lib/cracker`), C (`lib/engines/wasm/search.c`) and WGSL (`lib/engines/gpu/shader.ts`) implement the same search: change them together, and keep the equality tests in `scripts/test-cracker.ts` passing.
- The fast search visits candidates in a different order from the reference. Compare them over whole slices (`2^(48 - lowBits)` candidates), not single blocks.
- Keep the real-world regression in the tests (structure seed `243589975250422`, world seed `2722106614767293942`).
- GPU changes can only be checked in a browser with WebGPU: build, run `next start`, open `/gpu-bench` in a visible (not headless) Chrome window. Headless Chrome only has a software adapter. Every case must say "same hits".
- After editing `search.c` or `biomes.c`, rebuild and commit the `.wasm` files.
- Never edit `lib/engines/biomes/cubiomes/` (vendored, MIT). The C tables in `biomes.c` (`VERSION_IDS`, `STRUCT_IDS`) and `ids.ts` (`BIOME_VERSIONS`, `BIOME_STRUCTURES`) must stay in the same order.
- Biome narrowing must never drop a real seed: it uses biome viability only, not cubiomes' approximate terrain check.
- In hot modules, copy imported bindings into local constants once (see `lib/cracker/search.ts`). Imports compiled to getters made the JS search 10x slower.

## UI and wording rules

- Use shadcn components and the theme tokens in `src/app/globals.css`. The theme is dark only.
- User-facing messages: plain words, about 10 to 15 words, no em dashes anywhere (code comments and docs included; the managed Next.js block above is the one exception, since `next dev` rewrites it).
- Simple mode stays minimal; details belong in advanced mode.
- Digits render in JetBrains Mono through the `--font-digits` unicode-range face; keep it first in the font stack.
- No Minecraft textures, logos or other Mojang assets. Art here is original (`scripts/make-textures.py`, `src/components/cracker/structureIcons.ts`).

## Licensing

GPL-3.0-only (see `LICENSE`). Don't add code or assets with incompatible licenses. Record new third-party assets in the README credits.

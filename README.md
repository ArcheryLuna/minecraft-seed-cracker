# Seed Cracker

Find a Minecraft: Java Edition world seed from the structures you found.

Enter where you saw a few villages, temples, monuments, shipwrecks or other structures, and Seed Cracker works out the world seed. Everything runs in your browser: on your graphics card when it supports WebGPU, otherwise on every CPU core with WebAssembly. Nothing is uploaded.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

## Features

- **Fast.** Most lists crack in under a second. The search solves for candidates instead of testing all 2^48 structure seeds.
- **GPU or CPU.** Uses WebGPU when available, and falls back to WebAssembly CPU workers.
- **Forgiving.** Rounds measured positions the way the game builds each structure, and finds close matches when one to three entries are a little off.
- **Tells you which entry is wrong.** A close match says which structure doesn't fit and where it would really be.
- **World seeds, not just structure seeds.** Recovers the 64-bit seed for worlds made with a blank seed box, and spots typed text seeds.
- **Biome check.** Narrows the 65,536 world seeds by checking that every structure you found can really generate there, and by biomes you enter.
- **Seed generator.** A separate page (`/generate`) makes random seeds, turns text into seeds, and finds seeds with structures near a point, grouped together or in an exact chunk.
- **Downloads.** All 65,536 world seeds that share the structures, as TXT, PDF or Excel.
- **Simple and advanced modes.** Simple mode keeps it short. Advanced mode shows chunks, regions, information gained, speed and a GPU switch.

## Using it

1. Pick your game version (1.18 and later, or 1.16 to 1.17).
2. Add structures with their X and Z from the F3 screen. **Paste list** accepts lines like `village 312 -1048`.
3. Stand in the right place for each structure:
   - Villages, outposts, ancient cities, trail ruins, trial chambers: the bell or centre piece.
   - Ocean monuments: the top of the middle tower.
   - Temples, huts, igloos, ocean ruins: the north-west corner.
   - Ruined portals: the portal frame.
   - Woodland mansions: the middle of the building.
4. Press **Crack seed**. If there's no exact match, check the close matches.
5. Check the biome check under the result. If it leaves more than one seed, add the biome at a spot you know (F3 shows it).
6. Open the seed on a map to be sure.

**Try example** loads structures from a random world, so you can see it work first.

Five to eight structures is usually enough. Temples, huts, igloos, shipwrecks, ocean ruins and villages make it much faster.

## Running locally

Needs Node.js 20.9 or later.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # cracking maths, close matches, WebAssembly vs JS, a real world
npm run lint
npm run build
```

`/gpu-bench` (not linked from the site) compares the GPU, WebAssembly and JavaScript searches on the same seeds and times them. It needs a browser with a hardware WebGPU adapter.

## Deploying with Docker

The repository builds a small production image: a multi-stage `Dockerfile` that runs the Next.js standalone server as an unprivileged user, with a health check.

```bash
docker compose up -d --build          # http://localhost:3000
PORT=8080 docker compose up -d        # publish on another port
```

Or without Compose:

```bash
docker build -t seed-cracker .
docker run -d --name seed-cracker -p 3000:3000 --restart unless-stopped seed-cracker
```

The container only serves pages and static files; all cracking runs in the visitor's browser, so it needs very little CPU or memory. `docker-compose.yml` runs it with a read-only filesystem, no Linux capabilities and `no-new-privileges`.

**Serve it over HTTPS.** Browsers only allow WebGPU on secure pages (HTTPS or `localhost`). Over plain HTTP the site still works, but every search runs on the CPU. Put the container behind a reverse proxy that terminates TLS, such as Caddy, Traefik or nginx.

The image listens on port 3000 inside the container. Set the `PORT` environment variable to change that.

### Generated files

These are committed, so you only need the tools to change them.

| File | Built by | Needs |
|---|---|---|
| `src/lib/engines/wasm/search.wasm` | `scripts/build-wasm.sh` | clang with the wasm32 target, wasm-ld |
| `src/lib/engines/biomes/biomes.wasm` | `scripts/build-wasm.sh` | the same, plus wasi-libc and wasi-compiler-rt (`WASI_SYSROOT` if not in `/usr/share/wasi-sysroot`) |
| `src/lib/engines/biomes/biomeNames.ts` | a one-off C program over cubiomes (see `cubiomes/VENDORED.md`) | cubiomes |
| `src/lib/exports/pdf-fonts/*.ttf` | `scripts/make-pdf-fonts.py` | Python with fontTools |
| `public/textures/*.png` | `scripts/make-textures.py` | Python with Pillow |

## How it works

For the full explanation with formulas and a worked example, see [docs/how-it-works.pdf](docs/how-it-works.pdf) (source: `docs/how-it-works.html`, rebuilt with `scripts/build-docs.sh`).
For the rigorous version with definitions, proofs and complexity analysis, see [docs/math/seed-cracker-math.pdf](docs/math/seed-cracker-math.pdf) (LaTeX source alongside, built with `scripts/build-math-pdf.sh`).

1. **Placement grid.** Each structure type has a `spacing`, `separation` and `salt`. In region `(rx, rz)` the start chunk comes from `java.util.Random` seeded with `rx·341873128712 + rz·132897987541 + seed + salt`. That only uses the lower 48 bits of the world seed, the *structure seed*.
2. **Measured positions.** Block coordinates become start chunks per structure type (`blockToStart`). Monuments are centred on a chunk corner and villages rotate their centre around one, so those round to the nearest chunk border. Ruined portals can stick out west or north, so the next chunk is tried too.
3. **Lifting.** For `nextInt(n)` with `n = 2^k·m`, the result mod `2^k` depends only on the lowest `17+k` seed bits. The low bits are brute-forced on their own and almost all patterns are discarded.
4. **Solving the high bits.** For each surviving pattern, the high bits are searched one block of 2^24 at a time. With the low 24 bits fixed, the first random draw is an invertible affine function of the high bits, so the search solves for the values that give the right offset (every 25th for portals, every 13th for villages) and fully checks only those.
5. **Close matches.** A second pass accepts seeds that miss one to three structures, as long as the rest still pin the seed down (at least 50 bits), so chance matches stay rare.
6. **World seeds.** Structures can't see the top 16 bits, so 65,536 world seeds share a layout. Seeds from a blank seed box come from `Random.nextLong()`, which can be reversed, usually to exactly one seed. Typed text seeds (32-bit `hashCode`) are detected too.
7. **Biomes.** Biomes do depend on all 64 bits. [cubiomes](https://github.com/Cubitect/cubiomes), compiled to WebAssembly, checks each of the 65,536 world seeds: a structure only generates if the biome at its position allows it, and any biomes the player entered must match. The seed generator uses the same engine, trying random seeds against the grid first and biomes second.

**Where searches run.** CPU workers run the search in WebAssembly (C with native 64-bit integers, 2 to 6 times faster than the JS version). On the GPU, a WGSL compute shader does all the per-block work in a dedicated worker, with batches pipelined and sized to about 60 ms. Every hit from either is re-checked with a plain BigInt reference implementation. Time estimates use measured speed models, so the "too slow" limit and the close-match budget depend on the device that will run the search.

## Code layout

Each folder has an `index.ts` with its public API. Import from the folder, not its files.

| Folder | What it holds |
|---|---|
| `src/lib/minecraft/` | Game facts: `java.util.Random`, structure data and measured-position rules, placement, world seeds, example worlds. |
| `src/lib/cracker/` | The algorithm, with no browser APIs: observations, lifting, the fast LCG and full check, strategy, search, cost, planning, verification. |
| `src/lib/engines/` | Where searches run: WebAssembly (`wasm/`), WebGPU (`gpu/`), the biome engine (`biomes/`, cubiomes plus `biomes.c`), the CPU and biome worker pools and the GPU worker client. |
| `src/lib/crack/` | The `useCracker` hook, status types, result checking, speed estimates. |
| `src/lib/input/` | Form entries, the paste-list parser, analysis and verdicts, formatting, the saved form. |
| `src/lib/exports/` | TXT, PDF and Excel downloads, and the PDF fonts. |
| `src/workers/` | Web workers for CPU search, GPU search, biomes and downloads. |
| `src/components/cracker/` | The form. |
| `src/components/results/` | The results and the biome check. |
| `src/components/generator/` | The seed generator page. |
| `src/components/nav/` | The navigation bar on every page. |
| `src/components/ui/` | shadcn components. |
| `scripts/` | Tests and asset generators. |

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to work on it.

## Credits

- **Minecraft Font** by JDGraphics (Jacob Debono), from [FontSpace](https://www.fontspace.com/minecraft-font-f28180). Listed as Public Domain; the font files say "Free for Commercial Use".
- **JetBrains Mono** by JetBrains, under the SIL Open Font License 1.1 (`src/app/fonts/JETBRAINS-MONO-OFL.txt`).
- **Pixelify Sans** and **Inter** from Google Fonts, under the SIL Open Font License 1.1.
- The dirt and grass textures and the structure icons are original pixel art made for this project.
- **cubiomes** by Cubitect, under the MIT License, vendored unmodified in `src/lib/engines/biomes/cubiomes/` (see its `LICENSE` and `VENDORED.md`).
- UI components from [shadcn/ui](https://ui.shadcn.com/). PDF and Excel files are made with [pdf-lib](https://pdf-lib.js.org/) and [ExcelJS](https://github.com/exceljs/exceljs).

People who worked on it are listed in [CONTRIBUTORS.md](CONTRIBUTORS.md).

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.

## License

Copyright (C) 2026 ArcheryLuna and contributors.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

The fonts and cubiomes listed under Credits keep their own licenses.

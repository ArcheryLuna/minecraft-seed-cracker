# Contributing to Seed Cracker

Thanks for helping. Bug reports, structure data fixes, speed-ups and UI improvements are all welcome.

## Before you start

- **Bugs:** open an issue with your structure list (the "Paste list" format is easiest), the game version, and what you expected. If you know the real seed, include it.
- **Bigger changes:** open an issue first so we can agree on the approach.
- **Security problems:** don't open a public issue. See [SECURITY.md](SECURITY.md).

## Setup

You need Node.js 20.9 or later.

```bash
npm install
npm run dev      # http://localhost:3000
```

Before you open a pull request, all of these must pass:

```bash
npm test         # cracking maths, close matches, WebAssembly vs JS, a real world
npm run lint
npx tsc --noEmit
npm run build
```

`npm test` takes a minute or two. It cracks random worlds, checks close matches, and checks that the fast search, the reference search and the WebAssembly search return exactly the same seeds.

## How the code is organised

See [Code layout in the README](README.md#code-layout). In short:

- `lib/minecraft` holds game facts, and `lib/cracker` holds the algorithm. Neither touches the browser.
- `lib/engines` runs searches (WebAssembly, WebGPU, workers). `lib/crack`, `lib/input` and `lib/exports` connect them to the UI.
- Import from a folder's `index.ts`, not from files inside another folder.
- Keep modules small and single-purpose. If a file grows past about 250 lines, split it.

## Rules for search code

The search must never miss a real seed or report a wrong one. So:

- **Keep the reference.** `searchRangeReference` (JS) and the BigInt `JavaRandom` are the source of truth. Every fast path must return exactly the same seeds as the reference. Add a test when you add a path.
- **Change all three engines together.** The JS search (`lib/cracker`), the C search (`lib/engines/wasm/search.c`) and the WGSL shader (`lib/engines/gpu/shader.ts`) implement the same algorithm. A change to one usually needs the same change in the others.
- **Rebuild WebAssembly** after editing `search.c` or `biomes.c` with `scripts/build-wasm.sh`, and commit the new `.wasm` files. The biome engine needs wasi-libc and wasi-compiler-rt.
- **Don't edit cubiomes.** `lib/engines/biomes/cubiomes/` is vendored unmodified. Put changes in `biomes.c`, and keep its tables in the same order as `lib/engines/biomes/ids.ts`.
- **Check the GPU** on `/gpu-bench` in a browser with WebGPU. It compares GPU, WebAssembly and JS hits and must say "same hits" for every case. CI can't run it, so mention the result in your pull request.
- **Watch hot loops.** Imported bindings can compile to getter calls. In hot modules, copy imports into local constants once (see the top of `lib/cracker/search.ts`).
- **Measure speed changes.** Include before and after numbers from `npm test` or `/gpu-bench`.

## Structure data

Structure placement values live in `lib/minecraft/structures.ts`. If you change spacing, separation, salt, spread or a measured-position rule, say where the value comes from, and add a real world (structure list plus known seed) to `scripts/test-cracker.ts` if you can.

## UI and wording

- Use the shadcn components in `src/components/ui`, and theme colours from `src/app/globals.css`. Avoid hard-coded colours.
- Keep messages plain and short: about 10 to 15 words, no em dashes.
- Simple mode stays minimal. Details go in advanced mode.
- Don't add Minecraft textures, logos or other Mojang assets. Art in this repo is original.
- Check phone width (about 390 px) as well as desktop.

## Pull requests

- Keep each pull request focused on one change.
- Describe what changed and why, and how you tested it.
- Add yourself to [CONTRIBUTORS.md](CONTRIBUTORS.md).

## License

Seed Cracker is licensed under the [GNU General Public License v3.0](LICENSE). By contributing, you agree that your contributions are licensed under the same license.

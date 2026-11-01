# cubiomes (vendored)

Biome generation and structure checks for Minecraft: Java Edition, by Cubitect.

- Source: https://github.com/Cubitect/cubiomes
- Commit: e61f90580cbd (2024-11-10, "Renamed MC_1_21_2 to MC_1_21_3")
- License: MIT (see `LICENSE` in this folder)

Only the modules Seed Cracker needs are copied: biomenoise, biomes, finders,
generator, layers, noise, rng.h and the `tables/` data. The files are
unmodified. Seed Cracker's wrapper is `../biomes.c`; build with
`scripts/build-wasm.sh`.

`../biomeNames.ts` lists the biomes for the UI. It was made once by a small C
program that loops over biome ids and the versions in `../ids.ts`, calling
`biome2str` for the name, `isOverworld` (and the nether and end lists) for the
dimension, and recording which versions have each biome. Redo it the same way
after updating cubiomes.

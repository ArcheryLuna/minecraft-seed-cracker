#!/bin/sh
# Builds the WebAssembly modules (the .wasm files are committed, so this only
# needs to run after changing the C code):
#   src/lib/engines/wasm/search.wasm    from search.c (clang wasm32 target, wasm-ld)
#   src/lib/engines/biomes/biomes.wasm  from biomes.c + vendored cubiomes
#                                        (also needs wasi-libc, wasi-compiler-rt)
set -e
cd "$(dirname "$0")/.."
clang --target=wasm32 -O3 -flto -nostdlib -fno-builtin \
  -Wall -Wextra -Wno-unused-parameter \
  -Wl,--no-entry -Wl,--lto-O3 -Wl,--strip-all \
  -o src/lib/engines/wasm/search.wasm src/lib/engines/wasm/search.c
ls -l src/lib/engines/wasm/search.wasm

WASI_SYSROOT="${WASI_SYSROOT:-/usr/share/wasi-sysroot}"
B=src/lib/engines/biomes
clang --target=wasm32-wasip1 --sysroot="$WASI_SYSROOT" -O3 -flto -mexec-model=reactor \
  -Wall -Wno-unused-function -Wno-unused-variable -Wno-unused-but-set-variable -Wno-sign-compare \
  -Wl,--no-entry -Wl,--lto-O3 -Wl,--strip-all -Wl,-z,stack-size=1048576 \
  -o "$B/biomes.wasm" "$B/biomes.c" "$B"/cubiomes/biomenoise.c "$B"/cubiomes/biomes.c \
  "$B"/cubiomes/finders.c "$B"/cubiomes/generator.c "$B"/cubiomes/layers.c "$B"/cubiomes/noise.c -lm
ls -l "$B/biomes.wasm"

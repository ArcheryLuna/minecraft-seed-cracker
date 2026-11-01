// java.util.Random, as Minecraft uses it for structure placement and seeds.
// Reference (BigInt) implementation: slow but obviously right. The fast search
// paths live in lib/cracker/lcg.ts, the WebAssembly module and the GPU shader.

export const MULT = 0x5deece66dn;
export const ADDEND = 0xbn;

export const MASK48 = (1n << 48n) - 1n;

export class JavaRandom {
  private seed: bigint;
  constructor(seed: bigint) {
    this.seed = (seed ^ MULT) & MASK48;
  }
  next(bits: number): number {
    this.seed = (this.seed * MULT + ADDEND) & MASK48;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }
  nextInt(n: number): number {
    if ((n & -n) === n) return Number((BigInt(n) * BigInt(this.next(31))) >> 31n);
    let bits: number, val: number;
    do {
      bits = this.next(31);
      val = bits % n;
    } while (bits - val + (n - 1) > 2147483647);
    return val;
  }
  nextLong(): bigint {
    return BigInt.asIntN(64, (BigInt(this.next(32)) << 32n) + BigInt(this.next(32)));
  }
}

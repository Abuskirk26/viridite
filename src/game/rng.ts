/** Integer LCG. Both phones step this the same way, so crates and AI gaps match. */

export class Rng {
  s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 1;
  }

  nextU32(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s;
  }

  /** 0 .. n-1. n <= 1 returns 0. */
  int(n: number): number {
    if (n <= 1) return 0;
    return this.nextU32() % n;
  }
}

/*
 * Seeded RNG plumbing — small and deterministic.
 *
 * Mulberry32 is the workhorse: 32-bit state, decent statistical
 * quality for visual noise, ~3 ns per call. Anything that needs
 * reproducible noise across multiple sweeps holds an RNG and calls
 * `reset(seed)` whenever it wants to replay the sequence — that's
 * what makes a burst fired at the same sweep phase render identically
 * every sweep, so persistence stacks coherent copies.
 */

/**
 * Stateful PRNG with explicit `reset(seed)`. Used by anything that
 * needs *reproducible* noise across multiple runs through the same
 * range — e.g. burst slots fired at a fixed sweep-phase that we want
 * to render identically every sweep so persistence stacks coherent
 * copies and a stable wisp builds up.
 *
 * Returns uniform [0, 1).
 */
export interface SeededRng {
  next(): number
  reset(seed: number): void
}

export function mulberry32(seed: number): SeededRng {
  let s = seed >>> 0
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    reset(newSeed: number) {
      s = newSeed >>> 0
    },
  }
}

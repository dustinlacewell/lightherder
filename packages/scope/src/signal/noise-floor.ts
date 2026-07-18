/*
 * Always-on white noise added to y across the whole sweep.
 */

export interface NoiseFloor {
  amp: number
  seed: number
}

export function makeNoiseFloor(): NoiseFloor {
  return { amp: 0, seed: 1 }
}

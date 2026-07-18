/*
 * Per-wave beam character — multiplies into the deposit pass's
 * global beam intensity / width at sample-time.
 */

export interface Beam {
  /** Per-sample intensity multiplier (1 = neutral). */
  intensity: number
  /** Per-sample beam width multiplier (1 = neutral). */
  width: number
}

export function makeBeam(): Beam {
  return { intensity: 1, width: 1 }
}

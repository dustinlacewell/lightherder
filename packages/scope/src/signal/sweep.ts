/*
 * Per-wave sweep + trigger configuration.
 *
 *   sweepSec   seconds-per-sweep clock
 *   xJitter    per-sample horizontal jiggle
 *   fireLevel  rising-edge trigger threshold (against sum of fundamentals)
 *   armLevel   level the trigger must drop below before re-firing
 *   phaseLock  when truthy, fundamentals' phase accumulators reset on fire
 */

export interface Sweep {
  sweepSec: number
  xJitter: number
  fireLevel: number
  armLevel: number
  /**
   * Truthy → every fundamental's phase accumulator resets to 0 at
   * trigger fire, so each sweep starts with all fundamentals in
   * their declared `phase` offset and the composite shape stays
   * visually stable. Falsy → fundamentals run free across sweeps,
   * producing natural beat-pattern evolution.
   */
  phaseLock: boolean
}

export function makeSweep(): Sweep {
  return {
    sweepSec: 0.005,
    xJitter: 0.001,
    fireLevel: 0.05,
    armLevel: -0.05,
    phaseLock: false,
  }
}

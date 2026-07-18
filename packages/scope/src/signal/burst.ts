/*
 * One phase-locked burst slot. Fires during a window inside each
 * sweep and emits seeded-pink noise modulated by three internal
 * sinusoids (amp / density / lowpass) parameterised by center +
 * depth + freq + phase.
 */

export interface Burst {
  /** Window start, in normalized sweep phase [0, 1]. */
  phase: number
  /** Window width, in normalized sweep phase. */
  width: number
  /** Seed for the burst's deterministic noise. */
  seed: number
  /** Probability per sweep that the burst actually fires (0..1). */
  occurrence: number
  /**
   * Beam intensity multiplier *inside* this burst's window. Composes
   * multiplicatively over the wave's beam.intensity.
   */
  beamI: number
  ampCenter: number
  ampDepth: number
  ampFreq: number
  ampPhase: number
  densityCenter: number
  densityDepth: number
  densityFreq: number
  densityPhase: number
  lowpassCenter: number
  lowpassDepth: number
  lowpassFreq: number
  lowpassPhase: number
}

export function makeBurst(
  seed = 1,
  phase = 0.2,
  width = 0.15,
): Burst {
  return {
    phase, width, seed,
    occurrence: 1,
    beamI: 0.3,
    ampCenter: 0.4, ampDepth: 0, ampFreq: 1, ampPhase: 0,
    densityCenter: 1, densityDepth: 0, densityFreq: 0, densityPhase: 0,
    lowpassCenter: 1, lowpassDepth: 0, lowpassFreq: 0, lowpassPhase: 0,
  }
}

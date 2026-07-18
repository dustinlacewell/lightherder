/*
 * A whole wave: beam + sweep + noise floor + N fundamentals + K bursts.
 *
 * This is just data. The caller (typically an app that drives dials
 * or some other parameter machine) is responsible for keeping the
 * field values up to date; the WavePumper reads them on each step.
 */

import { makeBeam, type Beam } from './beam'
import { makeSweep, type Sweep } from './sweep'
import { makeNoiseFloor, type NoiseFloor } from './noise-floor'
import { makeFundamental, type Fundamental } from './fundamental'
import type { Burst } from './burst'

export interface Wave {
  /**
   * When true, the wave is muted: the pumper emits no samples for it.
   * Lets a caller toggle a wave off without losing its configuration.
   * Default false.
   */
  mute: boolean
  beam: Beam
  sweep: Sweep
  noiseFloor: NoiseFloor
  fundamentals: Fundamental[]
  bursts: Burst[]
}

/** Fresh wave with sensible defaults — one fundamental at 600 Hz. */
export function makeWave(): Wave {
  return {
    mute: false,
    beam: makeBeam(),
    sweep: makeSweep(),
    noiseFloor: makeNoiseFloor(),
    fundamentals: [makeFundamental()],
    bursts: [],
  }
}

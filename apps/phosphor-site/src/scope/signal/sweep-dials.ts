/*
 * Per-wave sweep + trigger dials. Mirrors scope's `Sweep`. The
 * `phaseLock` dial is numeric (0/1) for serialization simplicity;
 * conversion to boolean happens in readSweep.
 */

import { dial, read, type Ctx, type Slot } from '@ldlework/dials'
import type { Sweep } from '@ldlework/scope'

export type SweepDials = {
  sweepSec: Slot<number>
  xJitter: Slot<number>
  fireLevel: Slot<number>
  armLevel: Slot<number>
  /** Numeric 0/1 boolean, modulatable but only crossings of 0.5 matter. */
  phaseLock: Slot<number>
}

export function makeSweepDials(): SweepDials {
  return {
    sweepSec: dial(0.005, {
      min: 0.0005, max: 0.05, step: 0.0001, label: 'sweepSec', scale: 'log',
      description: 'Seconds-per-sweep clock. Short sweeps = fast scan rate, more wave cycles cram into the trace.',
    }),
    xJitter: dial(0.001, {
      min: 0, max: 0.02, step: 0.0001, label: 'xJitter',
      description: 'Per-sample horizontal jiggle in NDC. Small values give a slightly unstable, organic horizontal wobble.',
    }),
    fireLevel: dial(0.05, {
      min: -1, max: 1, step: 0.001, label: 'fireLevel',
      description: 'Rising-edge trigger threshold. The sweep fires when the carrier crosses this level upward (after first arming below armLevel).',
    }),
    armLevel: dial(-0.05, {
      min: -1, max: 1, step: 0.001, label: 'armLevel',
      description: 'Level the carrier must drop below before the trigger re-arms. Hysteresis pair with fireLevel — keeps multiple-crossing noise from re-firing instantly.',
    }),
    phaseLock: dial(0, {
      min: 0, max: 1, step: 1, label: 'phaseLock (0/1)',
      description: 'When 1, every fundamental\'s phase accumulator resets to 0 at trigger fire — locks the composite shape stable. When 0, fundamentals drift relative to each other across sweeps, producing natural beat patterns.',
    }),
  }
}

export function readSweep(d: SweepDials, ctx: Ctx): Sweep {
  const v = read(d, ctx)
  return {
    sweepSec: v.sweepSec,
    xJitter: v.xJitter,
    fireLevel: v.fireLevel,
    armLevel: v.armLevel,
    phaseLock: v.phaseLock > 0.5,
  }
}

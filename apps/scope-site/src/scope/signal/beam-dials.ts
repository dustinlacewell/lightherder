/*
 * Per-wave beam character — site-side dials tree that mirrors
 * scope's `Beam` shape. `readBeam` converts a tree to the plain
 * struct each frame.
 */

import { dial, read, type Ctx, type Slot } from '@ldlework/dials'
import type { Beam } from '@ldlework/scope'

export type BeamDials = {
  intensity: Slot<number>
  width: Slot<number>
}

export function makeBeamDials(): BeamDials {
  return {
    intensity: dial(1.0, {
      min: 0, max: 4, step: 0.01, label: 'intensity',
      description: 'Per-wave beam brightness multiplier. Composes on top of the screen-level intensity. 1 = neutral, >1 boosts this wave above the others.',
    }),
    width: dial(1.0, {
      min: 0, max: 4, step: 0.01, label: 'width',
      description: 'Per-wave beam width multiplier. Composes on top of the screen-level beamWidth. 1 = neutral, >1 = fatter trace just for this wave.',
    }),
  }
}

export function readBeam(d: BeamDials, ctx: Ctx): Beam {
  const v = read(d, ctx)
  return { intensity: v.intensity, width: v.width }
}

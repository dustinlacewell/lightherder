import { dial, read, type Ctx, type Slot } from '@ldlework/dials'
import type { NoiseFloor } from '@ldlework/scope'

export type NoiseFloorDials = {
  amp: Slot<number>
  seed: Slot<number>
}

export function makeNoiseFloorDials(): NoiseFloorDials {
  return {
    amp: dial(0, {
      min: 0, max: 0.5, step: 0.001, label: 'amp',
      description: 'Always-on white-noise amplitude added to y across the whole sweep. Small values (~0.005) give a faint instrument hiss; large values overwhelm the carrier.',
    }),
    seed: dial(1, {
      min: 1, max: 9999, step: 1, label: 'seed',
      description: 'Seed for the noise generator. Change it to get a different noise sequence (won\'t look very different, but the bits underneath differ).',
    }),
  }
}

export function readNoiseFloor(d: NoiseFloorDials, ctx: Ctx): NoiseFloor {
  const v = read(d, ctx)
  return { amp: v.amp, seed: v.seed }
}

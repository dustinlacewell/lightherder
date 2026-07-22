/*
 * Pointer-trail dials — site-app-only knobs for the cursor stamp
 * effect. Lives alongside scope's screen + wave dials inside the
 * HeroPreset so the user's tweaks persist with the rest.
 */

import { dial, type Slot } from '@ldlework/dials'

export type PointerTrailDials = {
  sizePx: Slot<number>
  intensity: Slot<number>
  interpolation: Slot<number>
  rotation: Slot<number>
}

export function makePointerTrailDials(): PointerTrailDials {
  return {
    sizePx: dial(32, {
      min: 4, max: 256, step: 1, label: 'sizePx', scale: 'log',
      description: 'Cursor stamp edge length in CSS pixels. Independent of the source PNG resolution.',
    }),
    intensity: dial(1.0, {
      min: 0, max: 4, step: 0.01, label: 'intensity',
      description: 'Per-stamp brightness multiplier. Composes on top of the screen-level intensity at deposit time.',
    }),
    interpolation: dial(8, {
      min: 1, max: 32, step: 1, label: 'interpolation',
      description: 'Max stamps painted along the segment between last and current pointer position. Higher = continuous trail at fast motion; lower = dotted.',
    }),
    rotation: dial(0, {
      min: -3.1416, max: 3.1416, step: 0.01, label: 'rotation',
      description: 'Fixed cursor rotation in radians. The arrow PNG points top-left at 0; spin it for fun.',
    }),
  }
}

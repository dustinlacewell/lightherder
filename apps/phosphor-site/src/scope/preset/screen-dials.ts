/*
 * Screen dials — user-tunable CRT + beam display uniforms exposed
 * as modulatable slots. The reader splits the tree into:
 *
 *   - a `CrtPreset` for crt's effect chain (decay, halation, present)
 *   - a `BeamConfig` for the DepositPass's beam-width setter
 */

import { dial, read, type Ctx, type Slot } from '@ldlework/dials'
import type { CrtPreset } from '@ldlework/crt'

export type ScreenDials = {
  persistence: Slot<number>
  persistenceBeta: Slot<number>
  intensity: Slot<number>
  beamWidth: Slot<number>
  halationStrength: Slot<number>
  halationSigma: Slot<number>
  halationTint: Slot<number>
  saturationKnee: Slot<number>
  whiteHot: Slot<number>
  grain: Slot<number>
  flicker: Slot<number>
  alpha: Slot<number>
}

export function makeScreenDials(): ScreenDials {
  return {
    persistence: dial(0.985, {
      min: 0.5, max: 1, step: 0.001, label: 'persistence',
      description: 'Per-frame survival of the brightest fresh trace. Higher = longer-lived afterimage. 1.0 = trace never fades.',
    }),
    persistenceBeta: dial(1.0, {
      min: 0.2, max: 2, step: 0.01, label: 'β',
      description: 'Kohlrausch stretch exponent. β=1 pure exponential. β<1 stretched: bright peaks fade fast, dim tail lingers (real phosphors). β>1 compressed.',
    }),
    intensity: dial(0.4, {
      min: 0, max: 4, step: 0.01, label: 'intensity',
      description: 'Global deposit gain. Multiplies into every accumulator-writing pass (beam + cursor stamps + anything else).',
    }),
    beamWidth: dial(1.6, {
      min: 0.2, max: 6, step: 0.05, label: 'beamWidth (px)',
      description: 'Beam Gaussian σ in CSS pixels at 1× DPR. Larger σ = fatter trace. Halation glows on top of this regardless.',
    }),
    halationStrength: dial(1.0, {
      min: 0, max: 4, step: 0.01, label: 'halationStrength',
      description: 'How much the blurred halo adds to the final composite. 0 = no glow, just bare beam.',
    }),
    halationSigma: dial(8.0, {
      min: 0.5, max: 32, step: 0.1, label: 'halationSigma',
      description: 'Halation blur radius in CSS pixels at 1× DPR. Larger = wider, softer glow.',
    }),
    halationTint: dial(0.4, {
      min: 0, max: 1, step: 0.01, label: 'halationTint',
      description: 'Subtle warmth shift in the halation tint. Reserved for future taste; doesn\'t do much today.',
    }),
    saturationKnee: dial(2.5, {
      min: 0.1, max: 10, step: 0.05, label: 'satKnee',
      description: 'Intensity threshold where color starts blowing toward white. Below knee: pure phosphor color. Above: bleach.',
    }),
    whiteHot: dial(1.2, {
      min: 0.1, max: 8, step: 0.05, label: 'whiteHot',
      description: 'Speed of the bleach-to-white transition past the knee. Higher = sharper hot-spot blowout.',
    }),
    grain: dial(0.03, {
      min: 0, max: 0.3, step: 0.001, label: 'grain',
      description: 'Phosphor granularity noise. Subtractive — only applied where there\'s signal. 0 = pristine, smooth trace.',
    }),
    flicker: dial(0.01, {
      min: 0, max: 0.1, step: 0.001, label: 'flicker',
      description: '120Hz brightness wobble (mains hum, halved). 0 = no flicker. Small values give an authentic CRT shimmer.',
    }),
    alpha: dial(1.0, {
      min: 0, max: 1, step: 0.01, label: 'alpha',
      description: 'Global surface opacity. Fades the whole trace (including its halo) as one layer; the dark glass beneath shows through at low values.',
    }),
  }
}

export interface BeamConfig {
  beamWidthPx: number
}

export function readScreenDials(
  screen: ScreenDials,
  ctx: Ctx,
): { preset: CrtPreset; beam: BeamConfig } {
  const s = read(screen, ctx)
  return {
    preset: {
      persistence: s.persistence,
      persistenceBeta: s.persistenceBeta,
      intensity: s.intensity,
      halationStrength: s.halationStrength,
      halationSigma: s.halationSigma,
      halationTint: s.halationTint,
      saturationKnee: s.saturationKnee,
      whiteHot: s.whiteHot,
      grain: s.grain,
      flicker: s.flicker,
      alpha: s.alpha,
    },
    beam: { beamWidthPx: s.beamWidth },
  }
}

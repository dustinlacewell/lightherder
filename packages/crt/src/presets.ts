/*
 * Phosphor coating presets. Each `CrtPreset` is a snapshot of the
 * tunable display uniforms — what kind of phosphor this surface is
 * supposed to simulate. No behaviour, just data.
 *
 *   <CrtSurface passes={...} {...PHOSPHOR_P31} />
 *
 * Names follow real-world phosphor designations — P31, P7, P39 are
 * the actual cathodoluminescent coating identifiers, not API names.
 */

import type { CrtPreset } from './types'

/**
 * P31 (ZnS:Cu, yellow-green) — the classic oscilloscope phosphor.
 * Short persistence (~38 µs to 10% in hardware), bright fluorescence,
 * subtle ghost tail. The defaults of the whole component target P31.
 */
export const PHOSPHOR_P31: CrtPreset = Object.freeze({
  persistence: 0.86,
  persistenceBeta: 0.6,
  intensity: 0.55,
  halationStrength: 0.8,
  halationSigma: 4,
  halationTint: 0,
  saturationKnee: 2.5,
  whiteHot: 1.4,
  grain: 0.025,
  flicker: 0,
})

/**
 * P7 (cascade, blue→yellow) — long persistence. The fade lingers for
 * visible seconds. Classic radar / slow-scan look.
 */
export const PHOSPHOR_P7: CrtPreset = Object.freeze({
  persistence: 0.985,
  persistenceBeta: 0.5,
  intensity: 0.45,
  halationStrength: 0.6,
  halationSigma: 5,
  halationTint: 0,
  saturationKnee: 3.0,
  whiteHot: 1.0,
  grain: 0.03,
})

/**
 * P39 (ZnO:Zn, yellow-green long-persistence) — slow-scan / radar.
 * Heavier ghost trail than P31, less saturated than P7.
 */
export const PHOSPHOR_P39: CrtPreset = Object.freeze({
  persistence: 0.95,
  persistenceBeta: 0.55,
  intensity: 0.5,
  halationStrength: 0.7,
  halationSigma: 5,
  halationTint: 0,
  saturationKnee: 2.8,
  whiteHot: 1.2,
  grain: 0.03,
})

/**
 * "Beauty" mode — not strictly physical. Pumped halation, lower
 * saturation knee, blown highlights. For when the trace IS the design,
 * not just instrumentation.
 */
export const PHOSPHOR_BEAUTY: CrtPreset = Object.freeze({
  persistence: 0.91,
  persistenceBeta: 0.65,
  intensity: 0.7,
  halationStrength: 1.4,
  halationSigma: 8,
  halationTint: 0,
  saturationKnee: 1.8,
  whiteHot: 1.5,
  grain: 0.02,
  flicker: 0.008,
})

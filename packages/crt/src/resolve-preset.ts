/*
 * Resolve a `CrtPreset` (every field optional) into a `ResolvedUniforms`
 * snapshot with all defaults filled in.
 *
 * Defaults come from `PHOSPHOR_P31` first, then a hard-coded fallback
 * in case the preset itself omits a field.
 *
 * `phosphorColor` is left optional in the output — the surface's rAF
 * resolves it from `--theme-lit-bright` if absent. Intentional: the
 * colour is read live so dragging a host theme's hue control recolours
 * the trace within a frame.
 */

import { PHOSPHOR_P31 } from './presets'
import type { CrtPreset, ResolvedUniforms } from './types'

export function resolvePreset(p: CrtPreset): ResolvedUniforms {
  return {
    persistence: p.persistence ?? PHOSPHOR_P31.persistence ?? 0.94,
    beta: p.persistenceBeta ?? PHOSPHOR_P31.persistenceBeta ?? 0.7,
    intensity: p.intensity ?? PHOSPHOR_P31.intensity ?? 1.0,
    haloI: p.halationStrength ?? PHOSPHOR_P31.halationStrength ?? 0.55,
    haloSigmaPx: p.halationSigma ?? PHOSPHOR_P31.halationSigma ?? 8,
    haloTint: p.halationTint ?? PHOSPHOR_P31.halationTint ?? 0.15,
    satKnee: p.saturationKnee ?? PHOSPHOR_P31.saturationKnee ?? 0.7,
    whiteHot: p.whiteHot ?? PHOSPHOR_P31.whiteHot ?? 1.0,
    grain: p.grain ?? PHOSPHOR_P31.grain ?? 0.04,
    flicker: p.flicker ?? PHOSPHOR_P31.flicker ?? 0,
    alpha: p.alpha ?? PHOSPHOR_P31.alpha ?? 1,
    resolutionScale: p.resolutionScale ?? PHOSPHOR_P31.resolutionScale ?? 1,
    phosphorColor: p.phosphorColor,
    whitePoint: p.whitePoint ?? [1, 1, 1],
  }
}

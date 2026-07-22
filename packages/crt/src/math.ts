/*
 * Pure numeric helpers factored out of the GL passes so they're
 * testable without a WebGL context. Each one is the exact math its
 * pass uniform-uploads every frame — kept in lockstep by hand since
 * there's no runtime coupling back to the pass classes.
 */

/**
 * Per-frame survival factor for DecayPass: `persistence` is defined as
 * the survival over one 60fps frame, so raise it to `dt * 60` to get
 * the survival for the actual elapsed time. Clamped to keep the base
 * inside `(0, 1)` — 0 or 1 would make `pow` degenerate.
 */
export function decaySurvival(persistence: number, dt: number): number {
  return Math.pow(Math.max(0.0001, Math.min(0.9999, persistence)), dt * 60)
}

/** Beta uniform floor — 0 would zero out the Kohlrausch exponent's base. */
export function decayBeta(beta: number): number {
  return Math.max(0.1, beta)
}

export interface HalationStepInput {
  /** Halation blur radius, CSS px at 1x DPR (`ResolvedUniforms.haloSigmaPx`). */
  haloSigmaPx: number
  /** Halo render target width in FBO px. */
  haloWidthPx: number
  /** Canvas width in physical (backing-store) px. */
  canvasWidthPx: number
  /** Number of taps each side of center (matches `const int R` in the shader). */
  taps: number
}

export interface HalationStep {
  /** Per-tap sigma, in taps — the shader's `uSigmaTaps`. */
  sigmaTaps: number
  /** Per-tap step magnitude in FBO px — divide by target width/height for `uStep`. */
  stepMag: number
}

/**
 * Convert a CSS-pixel halation radius into the halo pass's per-tap
 * sigma + step magnitude, accounting for the halo target's resolution
 * relative to the canvas (halation runs at half accumulator res).
 */
export function halationStep(input: HalationStepInput): HalationStep {
  const haloPxPerCssPx = (input.haloWidthPx / Math.max(input.canvasWidthPx, 1)) || 1
  const haloRadiusFboPx = input.haloSigmaPx * haloPxPerCssPx
  const sigmaTaps = Math.max(0.5, haloRadiusFboPx / input.taps)
  const stepMag = input.taps * sigmaTaps
  return { sigmaTaps, stepMag }
}

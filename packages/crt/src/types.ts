/*
 * Public + internal types for the CRT renderer pipeline.
 *
 * Public (re-exported from the package barrel):
 *   - CrtPreset, CrtSurfaceProps   React surface props
 *   - DrawCtx                       per-frame context handed to passes
 *
 * Pass plumbing lives in `@ldlework/gl/substrate` — we use its
 * `DrawablePass<DrawCtx>` + `ResizablePass` interfaces directly.
 *
 * Crt is content-agnostic. It owns the phosphor effect chain (decay →
 * caller passes → halation → present). Beam-specific things
 * (BeamFn, SegmentBatch, beamWidth) live in `@ldlework/scope`.
 */

import type { DrawablePass, RenderTarget } from '@ldlework/gl'
import type { CSSProperties } from 'react'

// ─── Preset / React props ──────────────────────────────────────────

/**
 * Snapshot of the tunable display uniforms. Every field optional;
 * resolvePreset fills defaults from PHOSPHOR_P31.
 *
 * Crt's preset only carries fields the *fixed* effect chain consumes
 * (decay, halation, present) plus one general gain for content drawn
 * into the accumulator. Application-layer passes (e.g. beam deposit)
 * extend this with their own fields.
 */
export interface CrtPreset {
  /** Per-frame multiplicative survival of the brightest fresh trace. */
  persistence?: number
  /**
   * Kohlrausch stretch exponent. β = 1 → pure exponential. β < 1 →
   * stretched: fast initial fade with a long, dim tail (most real
   * phosphors). β > 1 → compressed.
   */
  persistenceBeta?: number
  /**
   * Global multiplier applied to *every* pass that deposits intensity
   * into the accumulator (DepositPass, StampPass, anything you write).
   * Acts as a master gain on the "stuff being drawn" before persistence
   * and halation.
   */
  intensity?: number
  /** Halation additive strength. */
  halationStrength?: number
  /** Halation exponential blur radius, in CSS pixels at 1× DPR. */
  halationSigma?: number
  /** Subtle warmth shift in the halation (0 = none, 1 = strong). */
  halationTint?: number
  /** Intensity above which color desaturates toward the white point. */
  saturationKnee?: number
  /** How aggressively the bright core blows to white. */
  whiteHot?: number
  /** Screen grain noise (phosphor granularity). */
  grain?: number
  /** Optional 120Hz brightness wobble (mains hum, halved). */
  flicker?: number
  /**
   * Global surface opacity in [0, 1]. Multiplied into the final
   * alpha of every fragment, so it fades the trace (and its halo)
   * as one layer without affecting anything beneath. Default 1.
   */
  alpha?: number
  /**
   * Phosphor base emission color, as `[r, g, b]` in 0..1. When
   * omitted, read live from `--theme-lit-bright`.
   */
  phosphorColor?: readonly [number, number, number]
  /** White point chromaticity at full burn — usually pure white. */
  whitePoint?: readonly [number, number, number]
  /**
   * Accumulation FBO resolution as a fraction of canvas pixel size.
   * Lower = coarser grain (more authentic) + cheaper. Default 1.
   */
  resolutionScale?: number
}

export interface CrtSurfaceProps extends CrtPreset {
  /**
   * Optional per-frame preset producer. When supplied, the surface
   * calls this inside its rAF loop and uses the returned CrtPreset
   * to resolve uniforms — taking precedence over the static prop
   * fields (which still act as the fallback for fields the function
   * leaves undefined). Use this when your preset values are driven by
   * time-varying sources (e.g. dials with attached LFOs) so updates
   * land every frame instead of only on React re-render.
   */
  presetFn?: (t: number, dt: number) => CrtPreset
  /**
   * Factory for passes to register with the pipeline, drawn between
   * decay and halation each frame. The factory runs once at mount
   * with the live GL context; the surface disposes the returned
   * passes on unmount.
   *
   * Consumers typically hold refs to specific passes inside the
   * factory body so they can stage per-frame state from `stage`
   * (e.g. a deposit pass's segment batch, a stamp pass's stamps).
   */
  passes: (gl: WebGL2RenderingContext) => DrawablePass<DrawCtx>[]
  /**
   * Optional per-frame staging callback. Invoked at the start of each
   * frame inside the surface's rAF, *before* the pipeline runs. Use
   * this to call setters on the passes you registered — populate a
   * segment batch, set a stamp list, etc.
   */
  stage?: (t: number, dt: number) => void
  className?: string
  style?: CSSProperties
}

/**
 * Function signature for a factory that builds passes given a live
 * GL context. The surface invokes one of these at mount and disposes
 * the result on unmount.
 */
export type PassFactory = (gl: WebGL2RenderingContext) => DrawablePass<DrawCtx>[]

// ─── Per-frame DrawCtx ─────────────────────────────────────────────

/**
 * Per-frame snapshot of every preset field, with defaults filled in.
 * Passed through `DrawCtx` to every pass.
 */
export interface ResolvedUniforms {
  persistence: number
  beta: number
  /** Master deposit gain — applied by every pass that writes intensity. */
  intensity: number
  haloI: number
  haloSigmaPx: number
  haloTint: number
  satKnee: number
  whiteHot: number
  grain: number
  flicker: number
  alpha: number
  resolutionScale: number
  phosphorColor: readonly [number, number, number] | undefined
  whitePoint: readonly [number, number, number]
}

/**
 * Two-element ping-pong of HDR accumulator render targets. Decay
 * reads `read` and writes `write`; registered passes additively write
 * into `write` between decay and halation; the next frame's `flip()`
 * swaps roles so what we just wrote becomes the next frame's `read`.
 */
export interface PingPongTargets {
  read: RenderTarget
  write: RenderTarget
  /** Swap read/write roles. */
  flip(): void
}

/**
 * Per-frame draw context. Pipeline builds one of these inside
 * `runFrame` and hands it to every registered pass.
 *
 *   - `gl`             the WebGL2 context
 *   - `uniforms`       the resolved preset (live values, this frame)
 *   - `t` / `dt`       wall-clock since mount + since last frame
 *   - `canvas*Px`      CSS-pixel canvas dims (for css→fbo conversions)
 *   - `fbo*`           accumulator FBO dims (in actual pixels)
 *   - `accum`          ping-pong of HDR accumulator targets
 *   - `phosphorColor`  resolved phosphor base color (theme or explicit)
 */
export interface DrawCtx {
  gl: WebGL2RenderingContext
  uniforms: ResolvedUniforms
  t: number
  dt: number
  canvasWidthPx: number
  canvasHeightPx: number
  fboWidth: number
  fboHeight: number
  accum: PingPongTargets
  phosphorColor: readonly [number, number, number]
}

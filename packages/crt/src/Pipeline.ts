/*
 * Pipeline — the phosphor effect chain.
 *
 * Owns the accumulator ping-pong + halation FBOs + the three fixed
 * stages of the chain (decay, halation, present). The "what gets
 * drawn into the accumulator" is *not* fixed — callers register an
 * ordered list of DrawablePass<DrawCtx> in the constructor. Pipeline
 * walks them between decay and halation each frame.
 *
 * Per-frame order (inside `runFrame`):
 *   1. DECAY              accum.read → accum.write
 *   2. CALLER PASSES      each pass additively writes into accum.write,
 *                         in registration order
 *   3. HALATION           accum.write → haloH → haloV (separable blur)
 *   4. PRESENT            tonemap + composite accum + halo → screen
 *   5. flip               next frame's read becomes what we just wrote
 *
 * "DepositPass for beams" is one example of a registered pass. A game
 * registering a SpritePass (or a stack of game-specific passes) gets
 * the same persistence + halation + tonemap treatment.
 *
 * Pipeline doesn't own the React lifecycle — that's CrtSurface — and
 * doesn't own the rAF loop. Drive `runFrame(input)` from wherever.
 */

import {
  createRenderTarget,
  disposeRenderTarget,
  resizeRenderTarget,
  type DrawablePass,
  type RenderTarget,
} from '@ldlework/gl'
import { DecayPass } from './passes/DecayPass'
import { HalationPass } from './passes/HalationPass'
import { PresentPass } from './passes/PresentPass'
import type { DrawCtx, PingPongTargets, ResolvedUniforms } from './types'

/**
 * The accumulator is HDR (RGBA16F) so additive draws can stack past
 * 1.0 without clipping. EXT_color_buffer_float is checked once at
 * construction.
 */
function makeAccumTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): RenderTarget {
  return createRenderTarget(gl, {
    width: w,
    height: h,
    internalFormat: gl.RGBA16F,
    format: gl.RGBA,
    type: gl.HALF_FLOAT,
    filter: gl.LINEAR,
  })
}

/**
 * Halation buffers run at half the accumulator resolution. Visually
 * indistinguishable from full-res because the blur kernel is wide.
 * Saves 4× fragment cost on every halation pass.
 */
function makeHaloTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): RenderTarget {
  return createRenderTarget(gl, {
    width: Math.max(2, Math.floor(w / 2)),
    height: Math.max(2, Math.floor(h / 2)),
    internalFormat: gl.RGBA16F,
    format: gl.RGBA,
    type: gl.HALF_FLOAT,
    filter: gl.LINEAR,
  })
}

export interface PipelineOptions {
  /**
   * Ordered list of passes that draw into the accumulator each frame,
   * between decay and halation. The pipeline does not take ownership
   * of disposal — the caller that constructed the passes is
   * responsible for disposing them.
   *
   * Empty list is valid: the surface will run pure decay+halation
   * over whatever's already in the accumulator (which after the
   * first clear is nothing, so the screen stays dark).
   */
  passes: DrawablePass<DrawCtx>[]
}

/**
 * Per-frame inputs to `runFrame`. The pipeline-owned bits (accum
 * ping-pong, fbo dims) are filled in inside `runFrame`; the caller
 * supplies live values (uniforms, t/dt, canvas dims, phosphor color).
 */
export interface FrameInput {
  uniforms: ResolvedUniforms
  t: number
  dt: number
  canvasWidthPx: number
  canvasHeightPx: number
  phosphorColor: readonly [number, number, number]
}

export class Pipeline {
  private accumA: RenderTarget
  private accumB: RenderTarget
  private haloH: RenderTarget
  private haloV: RenderTarget
  private pingIsA = true

  readonly decay: DecayPass
  readonly halation: HalationPass
  readonly present: PresentPass
  private readonly passes: DrawablePass<DrawCtx>[]

  constructor(
    readonly gl: WebGL2RenderingContext,
    fboWidth: number,
    fboHeight: number,
    options: PipelineOptions,
  ) {
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('CrtSurface requires EXT_color_buffer_float')
    }
    this.accumA = makeAccumTarget(gl, fboWidth, fboHeight)
    this.accumB = makeAccumTarget(gl, fboWidth, fboHeight)
    this.haloH = makeHaloTarget(gl, fboWidth, fboHeight)
    this.haloV = makeHaloTarget(gl, fboWidth, fboHeight)

    this.decay = new DecayPass(gl)
    this.halation = new HalationPass(gl)
    this.present = new PresentPass(gl)
    this.passes = options.passes
  }

  get fboWidth(): number { return this.accumA.w }
  get fboHeight(): number { return this.accumA.h }

  /**
   * Resize all canvas-sized FBOs. The accumulator history is *lost*
   * on resize — there's no clean way to reproject HDR samples to a
   * new resolution, and resizes are rare enough that clearing is
   * acceptable. Halation buffers track at half-res.
   *
   * Resizable caller-supplied passes are *not* resized here — the
   * pipeline doesn't assume it owns them. Caller can iterate their
   * own pass list and call `resize` on any `ResizablePass` if needed.
   */
  resize(fboWidth: number, fboHeight: number): void {
    if (this.accumA.w === fboWidth && this.accumA.h === fboHeight) return
    resizeRenderTarget(this.gl, this.accumA, fboWidth, fboHeight)
    resizeRenderTarget(this.gl, this.accumB, fboWidth, fboHeight)
    const halfW = Math.max(2, Math.floor(fboWidth / 2))
    const halfH = Math.max(2, Math.floor(fboHeight / 2))
    resizeRenderTarget(this.gl, this.haloH, halfW, halfH)
    resizeRenderTarget(this.gl, this.haloV, halfW, halfH)
    this.pingIsA = true
    this.decay.resize(fboWidth, fboHeight)
    this.halation.resize(fboWidth, fboHeight)
    this.present.resize(fboWidth, fboHeight)
  }

  /**
   * Run one frame: decay → caller passes → halation → present → flip.
   * Caller stages per-pass inputs (e.g. `depositPass.setBatch(...)`)
   * before calling this.
   */
  runFrame(input: FrameInput): void {
    const ctx = this.buildCtx(input)
    this.decay.draw(ctx)
    for (const pass of this.passes) pass.draw(ctx)
    this.halation.drawBlur(ctx, ctx.accum.write.tex, this.haloH, this.haloV)
    this.present.drawToScreen(ctx, ctx.accum.write.tex, this.haloV.tex)
    ctx.accum.flip()
  }

  private buildCtx(input: FrameInput): DrawCtx {
    const read = this.pingIsA ? this.accumA : this.accumB
    const write = this.pingIsA ? this.accumB : this.accumA
    const pingPong: PingPongTargets = {
      read,
      write,
      flip: () => { this.pingIsA = !this.pingIsA },
    }
    return {
      gl: this.gl,
      uniforms: input.uniforms,
      t: input.t,
      dt: input.dt,
      canvasWidthPx: input.canvasWidthPx,
      canvasHeightPx: input.canvasHeightPx,
      fboWidth: this.fboWidth,
      fboHeight: this.fboHeight,
      accum: pingPong,
      phosphorColor: input.phosphorColor,
    }
  }

  dispose(): void {
    this.decay.dispose()
    this.halation.dispose()
    this.present.dispose()
    disposeRenderTarget(this.gl, this.accumA)
    disposeRenderTarget(this.gl, this.accumB)
    disposeRenderTarget(this.gl, this.haloH)
    disposeRenderTarget(this.gl, this.haloV)
    // Caller-supplied passes are disposed by their owner, not us.
  }
}

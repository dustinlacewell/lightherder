/*
 * DepositPass — additive segment-deposit (woscope analytical
 * line-integral). One instanced quad per segment; the fragment
 * shader computes a Gaussian beam integral analytically.
 *
 * Per-segment instance layout (SEGMENT_STRIDE = 6 floats):
 *   location 1, aSeg  — vec4(startX, startY, endX, endY) in NDC
 *   location 2, aBeam — vec2(beamI, beamWidthMul), per-segment beam
 *                       character. Multiplied with the per-pass
 *                       baseline beamSigmaPx + the global intensity.
 *
 * The pass owns its segment batch (`setBatch`) and its beam width
 * (`setBeamWidth`). Global deposit gain comes from `ctx.uniforms.intensity`.
 */

import { createProgram, requireUniform } from '@ldlework/gl/substrate'
import type { DrawablePass, ResizablePass } from '@ldlework/gl'
import type { DrawCtx } from '@ldlework/crt'

import vsSrc from '../shaders/deposit.vert.glsl?raw'
import fsSrc from '../shaders/deposit.frag.glsl?raw'

/** Number of floats per segment in `SegmentBatch.data`. */
export const SEGMENT_STRIDE = 6

/**
 * Segment instance data — uploaded once per frame by the segment pump,
 * consumed by DepositPass. Caller stages a batch via `setBatch()`
 * before each `pipeline.runFrame()`.
 */
export interface SegmentBatch {
  data: Float32Array
  count: number
}

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
const SEG_BYTES = SEGMENT_STRIDE * Float32Array.BYTES_PER_ELEMENT
const EMPTY_BATCH: SegmentBatch = { data: new Float32Array(0), count: 0 }

export class DepositPass implements DrawablePass<DrawCtx>, ResizablePass {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly cornerBuf: WebGLBuffer
  private readonly instanceBuf: WebGLBuffer
  private readonly uHalfSizePx: WebGLUniformLocation
  private readonly uBeamSigmaPx: WebGLUniformLocation
  private readonly uBeamI: WebGLUniformLocation
  private batch: SegmentBatch = EMPTY_BATCH
  /** Baseline beam Gaussian σ in CSS pixels at 1× DPR. */
  private beamSigmaPx = 1.4

  constructor(gl: WebGL2RenderingContext, segmentCapacity: number) {
    this.gl = gl
    this.program = createProgram(gl, vsSrc, fsSrc)
    this.uHalfSizePx = requireUniform(gl, this.program, 'uHalfSizePx')
    this.uBeamSigmaPx = requireUniform(gl, this.program, 'uBeamSigmaPx')
    this.uBeamI = requireUniform(gl, this.program, 'uBeamI')

    const vao = gl.createVertexArray()
    if (!vao) throw new Error('createVertexArray failed')
    this.vao = vao
    gl.bindVertexArray(vao)

    const cornerBuf = gl.createBuffer()
    if (!cornerBuf) throw new Error('createBuffer failed (deposit corners)')
    this.cornerBuf = cornerBuf
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf)
    gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const instanceBuf = gl.createBuffer()
    if (!instanceBuf) throw new Error('createBuffer failed (deposit instances)')
    this.instanceBuf = instanceBuf
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      segmentCapacity * SEG_BYTES,
      gl.DYNAMIC_DRAW,
    )
    // aSeg (vec4) — start.xy, end.xy
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, SEG_BYTES, 0)
    gl.vertexAttribDivisor(1, 1)
    // aBeam (vec2) — per-sample beamI multiplier, beamWidth multiplier
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(
      2, 2, gl.FLOAT, false, SEG_BYTES,
      4 * Float32Array.BYTES_PER_ELEMENT,
    )
    gl.vertexAttribDivisor(2, 1)

    gl.bindVertexArray(null)
  }

  /**
   * Stage the segment batch the next `draw(ctx)` will paint. Caller
   * owns `batch.data`'s lifetime — typically a single Float32Array
   * reused across frames.
   */
  setBatch(batch: SegmentBatch): void {
    this.batch = batch
  }

  /** Set the baseline beam Gaussian σ in CSS pixels (default 1.4). */
  setBeamWidth(sigmaPx: number): void {
    this.beamSigmaPx = sigmaPx
  }

  draw(ctx: DrawCtx): void {
    const batch = this.batch
    if (batch.count === 0) return

    const gl = ctx.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.accum.write.fbo)
    gl.viewport(0, 0, ctx.fboWidth, ctx.fboHeight)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(this.program)
    gl.uniform2f(this.uHalfSizePx, ctx.fboWidth / 2, ctx.fboHeight / 2)
    const fboPxPerCssPx =
      (ctx.fboWidth / Math.max(ctx.canvasWidthPx, 1)) || 1
    gl.uniform1f(this.uBeamSigmaPx, this.beamSigmaPx * fboPxPerCssPx)
    gl.uniform1f(this.uBeamI, ctx.uniforms.intensity)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf)
    gl.bufferSubData(
      gl.ARRAY_BUFFER, 0,
      batch.data, 0,
      batch.count * SEGMENT_STRIDE,
    )
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.count)
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)
  }

  resize(_w: number, _h: number): void { void _w; void _h }

  dispose(): void {
    const gl = this.gl
    gl.deleteBuffer(this.instanceBuf)
    gl.deleteBuffer(this.cornerBuf)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
  }
}

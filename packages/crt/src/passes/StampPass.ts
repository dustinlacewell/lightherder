/*
 * StampPass — additive texture-stamp deposit.
 *
 * One instanced quad per stamp. The fragment shader reads the staged
 * texture's alpha channel and writes that, scaled by per-stamp and
 * preset-level intensity, into the monochrome HDR accumulator. Color
 * is applied later in PresentPass — stamps inherit the phosphor's
 * theme color same as the beam.
 *
 * Per-stamp instance layout (STAMP_STRIDE = 5 floats):
 *   location 1, aPos  — vec4(centerX, centerY, sizePx, rotation)
 *   location 2, aMul  — float per-stamp intensity multiplier
 *
 * All stamps in one batch share the same texture (one stamp call ==
 * one bound texture). Callers who want multiple textures issue
 * multiple StampPass instances or batch by atlas.
 */

import { createProgram, requireUniform } from '@ldlework/gl/substrate'
import type { DrawablePass, ResizablePass } from '@ldlework/gl'

import vsSrc from '../shaders/stamp.vert.glsl.gen'
import fsSrc from '../shaders/stamp.frag.glsl.gen'
import type { DrawCtx } from '../types'

/** One stamp to paint this frame. */
export interface Stamp {
  /** NDC center in [-1, 1]. */
  x: number
  y: number
  /** Edge length in CSS pixels (independent of texture resolution). */
  sizePx: number
  /** Per-stamp intensity multiplier (1 = neutral). */
  intensity?: number
  /** Optional rotation in radians (default 0). */
  rotation?: number
}

export const STAMP_STRIDE = 5
const STAMP_BYTES = STAMP_STRIDE * Float32Array.BYTES_PER_ELEMENT
const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])

export interface StampPassOptions {
  /** Max stamps per frame — sizes the instance buffer. Default 256. */
  capacity?: number
}

export class StampPass implements DrawablePass<DrawCtx>, ResizablePass {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly cornerBuf: WebGLBuffer
  private readonly instanceBuf: WebGLBuffer
  private readonly uHalfSizePx: WebGLUniformLocation
  private readonly uTex: WebGLUniformLocation
  private readonly uGlobalI: WebGLUniformLocation
  private readonly capacity: number
  private readonly instanceData: Float32Array

  private tex: WebGLTexture | null = null
  private stamps: readonly Stamp[] = []

  constructor(gl: WebGL2RenderingContext, options: StampPassOptions = {}) {
    this.gl = gl
    this.capacity = options.capacity ?? 256
    this.instanceData = new Float32Array(this.capacity * STAMP_STRIDE)

    this.program = createProgram(gl, vsSrc, fsSrc)
    this.uHalfSizePx = requireUniform(gl, this.program, 'uHalfSizePx')
    this.uTex = requireUniform(gl, this.program, 'uTex')
    this.uGlobalI = requireUniform(gl, this.program, 'uGlobalI')

    const vao = gl.createVertexArray()
    if (!vao) throw new Error('createVertexArray failed (stamp)')
    this.vao = vao
    gl.bindVertexArray(vao)

    const cornerBuf = gl.createBuffer()
    if (!cornerBuf) throw new Error('createBuffer failed (stamp corners)')
    this.cornerBuf = cornerBuf
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf)
    gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const instanceBuf = gl.createBuffer()
    if (!instanceBuf) throw new Error('createBuffer failed (stamp instances)')
    this.instanceBuf = instanceBuf
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf)
    gl.bufferData(gl.ARRAY_BUFFER, this.capacity * STAMP_BYTES, gl.DYNAMIC_DRAW)
    // aPos (vec4) — center.xy, sizePx, rotation
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STAMP_BYTES, 0)
    gl.vertexAttribDivisor(1, 1)
    // aMul (float) — intensity
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(
      2, 1, gl.FLOAT, false, STAMP_BYTES,
      4 * Float32Array.BYTES_PER_ELEMENT,
    )
    gl.vertexAttribDivisor(2, 1)

    gl.bindVertexArray(null)
  }

  /**
   * Stage the texture that subsequent stamps sample from. Caller owns
   * the texture's lifetime — StampPass just binds it. Pass null to
   * skip drawing until a texture is staged.
   */
  setTexture(tex: WebGLTexture | null): void {
    this.tex = tex
  }

  /**
   * Stage the stamps to draw on the next `draw(ctx)`. Excess stamps
   * (over capacity) are silently truncated.
   */
  setStamps(stamps: readonly Stamp[]): void {
    this.stamps = stamps
  }

  draw(ctx: DrawCtx): void {
    if (!this.tex || this.stamps.length === 0) return

    const gl = ctx.gl
    const n = Math.min(this.stamps.length, this.capacity)
    const data = this.instanceData
    for (let i = 0; i < n; i++) {
      const s = this.stamps[i]!
      const o = i * STAMP_STRIDE
      data[o]     = s.x
      data[o + 1] = s.y
      data[o + 2] = s.sizePx
      data[o + 3] = s.rotation ?? 0
      data[o + 4] = s.intensity ?? 1
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.accum.write.fbo)
    gl.viewport(0, 0, ctx.fboWidth, ctx.fboHeight)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(this.program)
    gl.uniform2f(this.uHalfSizePx, ctx.fboWidth / 2, ctx.fboHeight / 2)
    gl.uniform1f(this.uGlobalI, ctx.uniforms.intensity)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1i(this.uTex, 0)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * STAMP_STRIDE)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n)
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)
  }

  resize(_w: number, _h: number): void {
    void _w; void _h
  }

  dispose(): void {
    const gl = this.gl
    gl.deleteBuffer(this.instanceBuf)
    gl.deleteBuffer(this.cornerBuf)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
  }
}

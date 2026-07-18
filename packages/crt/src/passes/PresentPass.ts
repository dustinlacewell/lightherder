/*
 * PresentPass — tonemap + composite + grain + flicker, drawn to the
 * default framebuffer (the on-screen canvas). The fragment shader's
 * alpha output already encodes the standard-alpha transparency math,
 * so no BLEND state is enabled.
 */

import { createProgram, requireUniform } from '@ldlework/gl/substrate'
import type { Pass, ResizablePass } from '@ldlework/gl'

import vsSrc from '../shaders/fullscreen.vert.glsl?raw'
import fsSrc from '../shaders/present.frag.glsl?raw'
import type { DrawCtx } from '../types'

// PresentPass also has a custom signature (drawToScreen(ctx, accumTex,
// haloTex)) since it composites two textures; same shape rationale as
// HalationPass.
export class PresentPass implements Pass, ResizablePass {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly uAccum: WebGLUniformLocation
  private readonly uHalo: WebGLUniformLocation
  private readonly uHaloI: WebGLUniformLocation
  private readonly uHaloTint: WebGLUniformLocation
  private readonly uSatKnee: WebGLUniformLocation
  private readonly uWhiteHot: WebGLUniformLocation
  private readonly uGrain: WebGLUniformLocation
  private readonly uFlicker: WebGLUniformLocation
  private readonly uTime: WebGLUniformLocation
  private readonly uAlpha: WebGLUniformLocation
  private readonly uPhosphorColor: WebGLUniformLocation
  private readonly uWhitePoint: WebGLUniformLocation

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.program = createProgram(gl, vsSrc, fsSrc)
    this.uAccum = requireUniform(gl, this.program, 'uAccum')
    this.uHalo = requireUniform(gl, this.program, 'uHalo')
    this.uHaloI = requireUniform(gl, this.program, 'uHaloI')
    this.uHaloTint = requireUniform(gl, this.program, 'uHaloTint')
    this.uSatKnee = requireUniform(gl, this.program, 'uSatKnee')
    this.uWhiteHot = requireUniform(gl, this.program, 'uWhiteHot')
    this.uGrain = requireUniform(gl, this.program, 'uGrain')
    this.uFlicker = requireUniform(gl, this.program, 'uFlicker')
    this.uTime = requireUniform(gl, this.program, 'uTime')
    this.uAlpha = requireUniform(gl, this.program, 'uAlpha')
    this.uPhosphorColor = requireUniform(gl, this.program, 'uPhosphorColor')
    this.uWhitePoint = requireUniform(gl, this.program, 'uWhitePoint')
  }

  /**
   * Composite the accumulator + halo to the on-screen canvas with
   * tonemap, grain, flicker, and phosphor-color modulation.
   */
  drawToScreen(
    ctx: DrawCtx,
    accumTex: WebGLTexture,
    haloTex: WebGLTexture,
  ): void {
    const gl = ctx.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, ctx.canvasWidthPx, ctx.canvasHeightPx)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, accumTex)
    gl.uniform1i(this.uAccum, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, haloTex)
    gl.uniform1i(this.uHalo, 1)
    gl.uniform1f(this.uHaloI, ctx.uniforms.haloI)
    gl.uniform1f(this.uHaloTint, ctx.uniforms.haloTint)
    gl.uniform1f(this.uSatKnee, ctx.uniforms.satKnee)
    gl.uniform1f(this.uWhiteHot, ctx.uniforms.whiteHot)
    gl.uniform1f(this.uGrain, ctx.uniforms.grain)
    gl.uniform1f(this.uFlicker, ctx.uniforms.flicker)
    gl.uniform1f(this.uTime, ctx.t)
    gl.uniform1f(this.uAlpha, ctx.uniforms.alpha)
    gl.uniform3f(
      this.uPhosphorColor,
      ctx.phosphorColor[0],
      ctx.phosphorColor[1],
      ctx.phosphorColor[2],
    )
    gl.uniform3f(
      this.uWhitePoint,
      ctx.uniforms.whitePoint[0],
      ctx.uniforms.whitePoint[1],
      ctx.uniforms.whitePoint[2],
    )
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  resize(_w: number, _h: number): void {
    void _w
    void _h
  }

  dispose(): void {
    this.gl.deleteProgram(this.program)
  }
}

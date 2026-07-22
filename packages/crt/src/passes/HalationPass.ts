/*
 * HalationPass — two-pass separable exponential blur. Horizontal
 * (srcTex → haloH) then vertical (haloH → haloV). The Pipeline owns
 * the halo RenderTargets and passes them in, so this pass exposes
 * `drawBlur` rather than the uniform `Pass.draw(ctx)` shape.
 */

import { createProgram, requireUniform } from '@ldlework/gl/substrate'
import type { Pass, RenderTarget, ResizablePass } from '@ldlework/gl'

import vsSrc from '../shaders/fullscreen.vert.glsl.gen'
import fsSrc from '../shaders/halation.frag.glsl.gen'
import { halationStep } from '../math'
import type { DrawCtx } from '../types'

const TAPS = 8 // matches `const int R = 8` in halation.frag.glsl

// HalationPass doesn't implement DrawablePass<DrawCtx> because it needs
// the H/V halo targets supplied by the pipeline — its signature is
// `drawBlur(ctx, srcTex, haloH, haloV)` rather than the uniform
// `draw(ctx)` shape. It still implements the base `Pass` + `ResizablePass`
// interfaces so the pipeline can dispose / resize it uniformly.
export class HalationPass implements Pass, ResizablePass {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly uSrc: WebGLUniformLocation
  private readonly uStep: WebGLUniformLocation
  private readonly uSigmaTaps: WebGLUniformLocation

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.program = createProgram(gl, vsSrc, fsSrc)
    this.uSrc = requireUniform(gl, this.program, 'uSrc')
    this.uStep = requireUniform(gl, this.program, 'uStep')
    this.uSigmaTaps = requireUniform(gl, this.program, 'uSigmaTaps')
  }

  drawBlur(
    ctx: DrawCtx,
    srcTex: WebGLTexture,
    haloH: RenderTarget,
    haloV: RenderTarget,
  ): void {
    const gl = ctx.gl
    const { sigmaTaps, stepMag } = halationStep({
      haloSigmaPx: ctx.uniforms.haloSigmaPx,
      haloWidthPx: haloH.w,
      canvasWidthPx: ctx.canvasWidthPx,
      taps: TAPS,
    })

    gl.useProgram(this.program)

    gl.bindFramebuffer(gl.FRAMEBUFFER, haloH.fbo)
    gl.viewport(0, 0, haloH.w, haloH.h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, srcTex)
    gl.uniform1i(this.uSrc, 0)
    gl.uniform2f(this.uStep, stepMag / haloH.w, 0)
    gl.uniform1f(this.uSigmaTaps, sigmaTaps)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, haloV.fbo)
    gl.viewport(0, 0, haloV.w, haloV.h)
    gl.bindTexture(gl.TEXTURE_2D, haloH.tex)
    gl.uniform2f(this.uStep, 0, stepMag / haloV.h)
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

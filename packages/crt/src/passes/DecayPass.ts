/*
 * DecayPass — Kohlrausch stretched-exponential survival applied to the
 * previous-frame accumulator, written into the ping-pong write target.
 */

import { createProgram, requireUniform } from '@ldlework/gl/substrate'
import type { DrawablePass, ResizablePass } from '@ldlework/gl'

import vsSrc from '../shaders/fullscreen.vert.glsl.gen'
import fsSrc from '../shaders/decay.frag.glsl.gen'
import { decayBeta, decaySurvival } from '../math'
import type { DrawCtx } from '../types'

export class DecayPass implements DrawablePass<DrawCtx>, ResizablePass {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly uAccum: WebGLUniformLocation
  private readonly uPersistence: WebGLUniformLocation
  private readonly uBeta: WebGLUniformLocation

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.program = createProgram(gl, vsSrc, fsSrc)
    this.uAccum = requireUniform(gl, this.program, 'uAccum')
    this.uPersistence = requireUniform(gl, this.program, 'uPersistence')
    this.uBeta = requireUniform(gl, this.program, 'uBeta')
  }

  draw(ctx: DrawCtx): void {
    const gl = ctx.gl
    const survival = decaySurvival(ctx.uniforms.persistence, ctx.dt)
    gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.accum.write.fbo)
    gl.viewport(0, 0, ctx.fboWidth, ctx.fboHeight)
    gl.disable(gl.BLEND)
    gl.useProgram(this.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, ctx.accum.read.tex)
    gl.uniform1i(this.uAccum, 0)
    gl.uniform1f(this.uPersistence, survival)
    gl.uniform1f(this.uBeta, decayBeta(ctx.uniforms.beta))
    gl.bindVertexArray(null)
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

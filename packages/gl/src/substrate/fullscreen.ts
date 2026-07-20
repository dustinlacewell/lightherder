/*
 * The canonical image-processing pass: one fragment shader over the
 * whole target, uniforms applied from a plain record.
 *
 * Uses the bufferless fullscreen-triangle idiom — three vertices
 * synthesized from gl_VertexID, no vertex buffer at all. The default
 * vertex shader exposes `vUv` in [0,1]²; fragment shaders that need a
 * different interpolant can supply their own vertex source.
 *
 * The pass deliberately does NOT bind a render target: compose with
 * `toTarget` / `toTexture` / `toScreen` (framebuffers.ts) so target
 * routing stays at the call site where it reads top-down.
 */

import { createProgram } from './programs'
import { applyUniforms, reflectUniforms, type ReflectedUniform, type UniformValues } from './reflect'
import type { Pass } from './pass'

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
out vec2 vUv;
void main(){
  vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = v;
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`

export class FullscreenPass implements Pass {
  readonly program: WebGLProgram
  readonly uniforms: Record<string, ReflectedUniform>
  private vao: WebGLVertexArrayObject

  constructor(
    private gl: WebGL2RenderingContext,
    fragSrc: string,
    vertSrc: string = FULLSCREEN_VERT,
  ) {
    this.program = createProgram(gl, vertSrc, fragSrc)
    this.uniforms = reflectUniforms(gl, this.program)
    const vao = gl.createVertexArray()
    if (!vao) throw new Error('gl.createVertexArray returned null')
    this.vao = vao
  }

  /** Draw into whatever framebuffer/viewport is currently bound. */
  draw(values: UniformValues): void {
    const gl = this.gl
    gl.useProgram(this.program)
    applyUniforms(gl, this.uniforms, values)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    this.gl.deleteProgram(this.program)
    this.gl.deleteVertexArray(this.vao)
  }
}

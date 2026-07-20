/*
 * Texture history ring — a signal with its recent past.
 *
 * An N-deep set of same-format textures cycled by `advance()`. Any
 * feedback or simulation pass needs one: render into `next` while
 * sampling `current` (and deeper taps via `at(k)`), then advance.
 *
 * The ring owns textures only, not framebuffers — renderers with many
 * rings share one FBO and attach per draw (see `toTexture` in
 * framebuffers.ts). One FBO per ring texture would multiply GL objects
 * for no gain.
 */

import { createTexture2D } from './textures'

export interface TextureRingOpts {
  width: number
  height: number
  internalFormat: number
  format: number
  type: number
  /** Both MIN and MAG filter. Defaults to NEAREST (see textures.ts). */
  filter?: number
  /** Both WRAP_S and WRAP_T. Defaults to CLAMP_TO_EDGE. */
  wrap?: number
  /** History depth — how many frames back `at(k)` can reach. */
  depth: number
}

export class TextureRing {
  private texs: WebGLTexture[] = []
  private idx = 0

  readonly w: number
  readonly h: number
  /** History depth this ring was allocated with. */
  readonly depth: number

  constructor(
    private gl: WebGL2RenderingContext,
    opts: TextureRingOpts,
  ) {
    this.w = opts.width
    this.h = opts.height
    this.depth = opts.depth
    for (let i = 0; i < opts.depth; i++) {
      this.texs.push(
        createTexture2D(gl, {
          width: opts.width,
          height: opts.height,
          internalFormat: opts.internalFormat,
          format: opts.format,
          type: opts.type,
          data: null,
          ...(opts.filter !== undefined ? { filter: opts.filter } : {}),
          ...(opts.wrap !== undefined ? { wrap: opts.wrap } : {}),
        }),
      )
    }
  }

  /** Last committed frame. */
  get current(): WebGLTexture {
    return this.texs[this.idx]!
  }

  /** k frames back (0 = current). */
  at(k: number): WebGLTexture {
    const n = this.texs.length
    return this.texs[(this.idx - (k % n) + n) % n]!
  }

  /** The texture the next frame should render into. */
  get next(): WebGLTexture {
    return this.texs[(this.idx + 1) % this.texs.length]!
  }

  advance(): void {
    this.idx = (this.idx + 1) % this.texs.length
  }

  /**
   * Clear every texture in the ring to `color` through a shared FBO.
   * The clear color matters when channels carry state (accumulators,
   * gain fields) — hence no default.
   */
  clearAll(fbo: WebGLFramebuffer, color: [number, number, number, number]): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    for (const t of this.texs) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
      gl.viewport(0, 0, this.w, this.h)
      gl.clearColor(...color)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Free the GPU textures — call before dropping the ring. */
  dispose(): void {
    for (const t of this.texs) this.gl.deleteTexture(t)
    this.texs = []
  }
}

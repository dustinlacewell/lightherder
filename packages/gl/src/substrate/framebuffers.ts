/*
 * Framebuffer / render-target helpers.
 *
 * `RenderTarget` bundles an FBO with its colour texture and dimensions
 * so resize logic can act on a single object. `createRenderTarget`
 * allocates both and ties them together.
 *
 * `toTarget(gl, target, draw)` and `toScreen(gl, w, h, draw)` are the
 * key ergonomic primitives — they bind the FBO, set the viewport,
 * optionally clear, run the supplied draw callback, and restore the
 * default framebuffer. Code that uses them reads top-down as
 * "render this to that target, render that to the screen" instead of
 * a maze of bind / unbind / viewport calls.
 */

import { createTexture2D, resizeTexture2D } from './textures'

export interface RenderTarget {
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
  /**
   * Stored so resize can re-`texImage2D` with the same format. This
   * is bookkeeping the caller would otherwise have to maintain
   * themselves.
   */
  internalFormat: number
  format: number
  type: number
}

export interface RenderTargetOpts {
  width: number
  height: number
  /** Default RGBA8. */
  internalFormat?: number
  /** Default RGBA. */
  format?: number
  /** Default UNSIGNED_BYTE. */
  type?: number
  /** Default NEAREST. Use LINEAR for blurred-sample targets. */
  filter?: number
  /** Default CLAMP_TO_EDGE. */
  wrap?: number
}

/**
 * Allocate a fresh render target — colour texture + FBO with that
 * texture attached to COLOR_ATTACHMENT0.
 */
export function createRenderTarget(
  gl: WebGL2RenderingContext,
  opts: RenderTargetOpts,
): RenderTarget {
  const internalFormat = opts.internalFormat ?? gl.RGBA8
  const format = opts.format ?? gl.RGBA
  const type = opts.type ?? gl.UNSIGNED_BYTE
  const tex = createTexture2D(gl, {
    width: opts.width,
    height: opts.height,
    internalFormat,
    format,
    type,
    data: null,
    ...(opts.filter !== undefined ? { filter: opts.filter } : {}),
    ...(opts.wrap !== undefined ? { wrap: opts.wrap } : {}),
  })
  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error('gl.createFramebuffer returned null')
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  )
  // Sanity-check completeness so the failure mode is loud at creation
  // rather than silent at first draw.
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, tex, w: opts.width, h: opts.height, internalFormat, format, type }
}

/** Resize a render target's texture in place. */
export function resizeRenderTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget,
  width: number,
  height: number,
): void {
  if (target.w === width && target.h === height) return
  resizeTexture2D(
    gl,
    target.tex,
    width,
    height,
    target.internalFormat,
    target.format,
    target.type,
    null,
  )
  target.w = width
  target.h = height
}

export function disposeRenderTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget,
): void {
  gl.deleteFramebuffer(target.fbo)
  gl.deleteTexture(target.tex)
}

/**
 * Bind a render target FBO, set viewport, clear, run draw callback,
 * then restore the default framebuffer. Returns the target texture
 * so call sites can chain (`const intermediate = toTarget(gl, ...)`).
 */
export function toTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget,
  draw: () => void,
): WebGLTexture {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
  gl.viewport(0, 0, target.w, target.h)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  draw()
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return target.tex
}

/**
 * Variant of `toTarget` that does *not* clear the target. Useful for
 * additive accumulation passes where the previous frame's contents
 * are part of the input.
 */
export function toTargetNoClear(
  gl: WebGL2RenderingContext,
  target: RenderTarget,
  draw: () => void,
): WebGLTexture {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
  gl.viewport(0, 0, target.w, target.h)
  draw()
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return target.tex
}

/**
 * Bind the screen (default framebuffer), set viewport, run draw
 * callback. No clear by default — terminal pass usually composites
 * over whatever's already there.
 */
export function toScreen(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  draw: () => void,
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, w, h)
  draw()
}

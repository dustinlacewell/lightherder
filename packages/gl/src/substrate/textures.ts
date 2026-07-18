/*
 * Texture creation helpers.
 *
 * `createTexture2D` is the workhorse — one call sets internal format,
 * format, type, filter, wrap, and uploads initial data. Defaults are
 * NEAREST filter / CLAMP_TO_EDGE wrap because that's what most
 * compute-style passes want; pass `filter: gl.LINEAR` for sampled
 * passes (blur, composite).
 */

export interface TextureOpts {
  width: number
  height: number
  internalFormat: number
  format: number
  type: number
  data: ArrayBufferView | null
  /** Both MIN and MAG filter. Defaults to NEAREST. */
  filter?: number
  /** Both WRAP_S and WRAP_T. Defaults to CLAMP_TO_EDGE. */
  wrap?: number
}

export function createTexture2D(
  gl: WebGL2RenderingContext,
  opts: TextureOpts,
): WebGLTexture {
  const tex = gl.createTexture()
  if (!tex) throw new Error('gl.createTexture returned null')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.filter ?? gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.filter ?? gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrap ?? gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrap ?? gl.CLAMP_TO_EDGE)
  gl.texImage2D(
    gl.TEXTURE_2D, 0,
    opts.internalFormat,
    opts.width, opts.height, 0,
    opts.format, opts.type,
    opts.data,
  )
  return tex
}

/**
 * Resize a texture in-place to new dimensions, preserving format /
 * filter / wrap. Used for canvas-sized FBO targets when the viewport
 * changes. Pass `null` for `data` to leave contents undefined.
 */
export function resizeTexture2D(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  width: number,
  height: number,
  internalFormat: number,
  format: number,
  type: number,
  data: ArrayBufferView | null = null,
): void {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data)
}

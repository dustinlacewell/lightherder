/*
 * WebGL2 context acquisition + caching.
 *
 * The GL context is cached on the canvas DOM node so React StrictMode
 * double-mounts and HMR don't burn through contexts (browsers cap
 * live WebGL contexts per page).
 */

const GL_CACHE = Symbol('crtSurfaceGl')
type CanvasWithGl = HTMLCanvasElement & {
  [GL_CACHE]?: WebGL2RenderingContext
}

const CONTEXT_OPTS: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: false,
  antialias: false,
  preserveDrawingBuffer: false,
}

/**
 * Get (or create + cache) the WebGL2 context on this canvas. Returns
 * null if WebGL2 is unavailable.
 */
export function acquireGl(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  const cached = canvas as CanvasWithGl
  const existing = cached[GL_CACHE]
  if (existing) return existing
  const ctx = canvas.getContext('webgl2', CONTEXT_OPTS)
  if (!ctx) return null
  cached[GL_CACHE] = ctx
  return ctx
}

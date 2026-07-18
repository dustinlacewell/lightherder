/*
 * Canvas-sizing helper. Keeps the canvas's backing-store dimensions
 * synced to its CSS box (× DPR), and keeps the pipeline's FBO sized
 * to the canvas backing × `resolutionScale`.
 *
 * Pulled out so the React surface doesn't carry sizing math in its
 * effect body — the surface just installs the observer and lets this
 * fit() do the work.
 */

import type { Pipeline } from './Pipeline'
import { PHOSPHOR_P31 } from './presets'
import type { CrtSurfaceProps } from './types'

export interface FitterDeps {
  canvas: HTMLCanvasElement
  pipeline: Pipeline
  getProps: () => CrtSurfaceProps
}

/**
 * Build the fit() callback and a ResizeObserver wired to it. Caller
 * is responsible for disconnecting the observer in cleanup.
 *
 * The fitter is also returned so the caller can invoke it once
 * synchronously after construction (RO doesn't fire until layout).
 */
export function attachFitter(deps: FitterDeps): {
  fit(): void
  observer: ResizeObserver
} {
  const { canvas, pipeline, getProps } = deps
  let lastResScale = getProps().resolutionScale ?? PHOSPHOR_P31.resolutionScale ?? 1

  const fit = () => {
    const d = window.devicePixelRatio || 1
    const w = Math.max(2, Math.floor(canvas.clientWidth * d))
    const h = Math.max(2, Math.floor(canvas.clientHeight * d))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const scale =
      getProps().resolutionScale ?? PHOSPHOR_P31.resolutionScale ?? 1
    const tw = Math.max(2, Math.floor(w * scale))
    const th = Math.max(2, Math.floor(h * scale))
    if (
      tw !== pipeline.fboWidth ||
      th !== pipeline.fboHeight ||
      scale !== lastResScale
    ) {
      pipeline.resize(tw, th)
      lastResScale = scale
    }
  }

  const observer = new ResizeObserver(fit)
  observer.observe(canvas)
  return { fit, observer }
}

/**
 * Initial backing-store sizing — used once at mount before the
 * pipeline exists, so the pipeline can be built at the right size.
 */
export function sizeCanvasBacking(canvas: HTMLCanvasElement): {
  cssW: number
  cssH: number
} {
  const dpr = window.devicePixelRatio || 1
  const cssW = Math.max(2, canvas.clientWidth)
  const cssH = Math.max(2, canvas.clientHeight)
  canvas.width = Math.floor(cssW * dpr)
  canvas.height = Math.floor(cssH * dpr)
  return { cssW, cssH }
}

/*
 * CrtSurface — generic React mount for the phosphor effect chain.
 *
 * Owns: canvas + WebGL2 context + Pipeline + rAF loop. The pipeline's
 * pass list (what gets drawn between decay and halation) comes from
 * the caller's `passes` factory.
 *
 * Common consumers:
 *   - @ldlework/scope's <Scope> registers a DepositPass for beam-style
 *     oscilloscope traces.
 *   - Apps wanting to splash sprites / stamps / custom geometry into
 *     the phosphor accumulator register their own passes.
 *
 * This file is intentionally thin; everything beam-shaped used to live
 * here and has moved to scope where it belongs.
 */

import { useEffect, useRef } from 'react'
import { Pipeline } from '../Pipeline'
import { acquireGl } from '../gl-context'
import { sizeCanvasBacking, attachFitter } from '../canvas-fit'
import { resolvePreset } from '../resolve-preset'
import { resolveThemeColor } from '../theme-color'
import type { CrtPreset, CrtSurfaceProps, DrawCtx } from '../types'
import type { DrawablePass } from '@ldlework/gl'

export function CrtSurface(props: CrtSurfaceProps) {
  const { className, style } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Latest props live in a ref so the rAF loop reads current values
  // without re-binding when props change.
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    sizeCanvasBacking(canvas)

    const gl = acquireGl(canvas)
    if (!gl) {
      console.warn('CrtSurface: WebGL2 unavailable')
      return
    }

    // Initial FBO size — derived from the current preset at mount.
    const uniforms0 = resolvePreset(propsRef.current)
    const fboW = Math.max(2, Math.floor(canvas.width * uniforms0.resolutionScale))
    const fboH = Math.max(2, Math.floor(canvas.height * uniforms0.resolutionScale))

    let pipeline: Pipeline
    let passes: DrawablePass<DrawCtx>[] = []
    try {
      // Factory runs once with the live GL context. The surface owns
      // disposal of the resulting passes so consumers don't have to
      // dispose them by hand.
      passes = propsRef.current.passes(gl)
      pipeline = new Pipeline(gl, fboW, fboH, { passes })
    } catch (e) {
      console.error('CrtSurface: pipeline init failed', e)
      return
    }

    const getProps = () => propsRef.current
    const { fit, observer } = attachFitter({ canvas, pipeline, getProps })
    fit() // sync once before the first rAF

    const loop = startRenderLoop({ canvas, pipeline, getProps })

    return () => {
      loop.stop()
      observer.disconnect()
      pipeline.dispose()
      for (const p of passes) p.dispose()
      // The context lives on the canvas DOM node and is reused
      // across mounts; don't kill it here.
    }
    // Mount-time concerns only. Consumers wanting to swap the passes
    // factory must remount the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        background: 'transparent',
        ...style,
      }}
    />
  )
}

// ─── Render loop ─────────────────────────────────────────────────────

interface LoopDeps {
  canvas: HTMLCanvasElement
  pipeline: Pipeline
  getProps: () => CrtSurfaceProps
}

interface LoopHandle { stop(): void }

/**
 * Per-frame: resolve preset (static props + optional presetFn overlay),
 * resolve phosphor color from theme, hand the result to Pipeline.runFrame.
 * Pass-specific per-frame state (e.g. DepositPass's segment batch) is
 * the caller's job — they stage it inside whatever side channel their
 * pass exposes, *before* the next rAF tick lands.
 */
function startRenderLoop(deps: LoopDeps): LoopHandle {
  const { canvas, pipeline, getProps } = deps
  const t0 = performance.now()
  let tPrev = t0
  let raf = 0

  const tick = () => {
    const now = performance.now()
    const t = (now - t0) / 1000
    const dt = Math.max(0.0001, (now - tPrev) / 1000)
    tPrev = now

    const props = getProps()
    props.stage?.(t, dt)
    const live = props.presetFn?.(t, dt)
    const preset: CrtPreset = live ? { ...props, ...live } : props
    const uniforms = resolvePreset(preset)
    const phosphorColor =
      uniforms.phosphorColor ?? resolveThemeColor('var(--theme-lit-bright)')

    pipeline.gl.disable(pipeline.gl.DEPTH_TEST)
    pipeline.runFrame({
      uniforms,
      t,
      dt,
      canvasWidthPx: canvas.width,
      canvasHeightPx: canvas.height,
      phosphorColor,
    })

    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)
  return { stop() { cancelAnimationFrame(raf) } }
}

/*
 * Live miniature preview of a dials source — the sparkline inside the
 * attach picker's hover cards.
 *
 * Instantiates a PRIVATE instance of the def on mount and runs it in a
 * requestAnimationFrame loop, pushing samples into ring buffers and
 * redrawing a small canvas each frame. Owning the instance matters:
 * stateful sources mutate on sample, so previewing an instance that's
 * attached to a real slot would corrupt its state. The instance is
 * simply dropped on unmount.
 *
 * Combinators (`add`, `mul`, `lerp`, `smooth`, gates) default to
 * *constant* inputs, so their raw preview is a dead flat line. A demo
 * recipe (see `demoRecipes.ts`) drives their inputs with real demo
 * oscillators and names which traces to draw — the inputs faint, the
 * output in accent — so the combinator is seen combining. After each
 * `sampleSource`, the sampled inputs sit in the instance's `_buf`, so
 * the input traces cost no extra sampling. Sources without a recipe
 * draw a single accent trace of their raw output, as before.
 *
 * Efficiency story: the preview only exists while its hover card is
 * up, and at most one card shows at a time — so at most one preview
 * loop ever runs. No throttling beyond the dt clamp (which keeps the
 * trace sane across tab-jank).
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { instantiate, sampleSource, type SourceDef } from '@ldlework/dials'
import {
  DEFAULT_TRACES,
  DEMO_RECIPES,
  type BandSpec,
  type TraceSpec,
} from './demoRecipes'

/** CSS-pixel canvas size; backing store scales by devicePixelRatio. */
const WIDTH = 120
const HEIGHT = 36
/** Ring-buffer capacity — the visible history window, in samples. */
const POINTS = 96
/** dt clamp — a janky tab never advances the source by a huge step. */
const MAX_DT = 1 / 30
/** Vertical inset so the stroke + glow don't clip at the extremes. */
const PAD = 3

export function SourcePreview({
  def,
}: {
  def: SourceDef<any, any>
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(WIDTH * dpr)
    canvas.height = Math.round(HEIGHT * dpr)
    g.scale(dpr, dpr)

    // Resolve the modulation accent once — the stylesheet sets the
    // canvas's `color` to var(--chrome-accent-mod), so the computed
    // color is the fully-evaluated accent.
    const accent = getComputedStyle(canvas).color

    // Private instance — never sample a slot-attached one. A recipe, if
    // present, wires demo oscillators into its inputs so a combinator
    // has something to combine.
    const instance = instantiate(def)
    const recipe = DEMO_RECIPES[def.name]
    recipe?.wire(instance)
    const traces: TraceSpec[] = recipe?.traces ?? DEFAULT_TRACES
    const phaseRate = recipe?.ctxPhaseRate
    const band: BandSpec | undefined = recipe?.band

    // One ring buffer per trace, in draw order (faint inputs first,
    // accent output last).
    const rings = traces.map(() => new Float32Array(POINTS))
    let count = 0
    let head = 0 // next write index (shared — all traces advance together)

    const mid = HEIGHT / 2
    const half = mid - PAD
    const step = WIDTH / (POINTS - 1)

    // Vertical mapping: bipolar plots 0 at the midline, ±1 at the edges;
    // unipolar plots 0 at the bottom edge, 1 at the top (for the phase
    // ramp, so it reads as a full-height sweep and shares the band's
    // axis).
    const yBipolar = (v: number) => mid - v * half
    const yUnipolar = (v: number) => mid + half - v * (2 * half)
    const yFor = (spec: TraceSpec, v: number) =>
      spec.unipolar ? yUnipolar(v) : yBipolar(v)

    // Faint colour for input traces: the accent at low alpha, layered
    // behind the output. Canvas takes rgba()/rgb() strings; wrapping the
    // computed accent in a globalAlpha pass is simpler and colour-space
    // agnostic than string-munging.
    const buf = instance._buf as Record<string, unknown>
    const params = instance.params as Record<
      string,
      { dial: { value: number } }
    >
    const paramVal = (key: string) => params[key]?.dial.value ?? 0

    let t = 0
    let phase = 0
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now: number) {
      const dt = Math.min((now - last) / 1000, MAX_DT)
      last = now
      t += dt
      if (phaseRate !== undefined) phase = (phase + phaseRate * dt) % 1

      const ctx: Record<string, number> =
        phaseRate !== undefined ? { t, dt, phase } : { t, dt }
      const out = sampleSource(instance, ctx) as number

      // Snapshot every trace's value for this frame. Inputs come out of
      // the post-sample buffer; ctx traces (the phase ramp) out of the
      // ctx we just passed; the output is the return value.
      for (let ti = 0; ti < traces.length; ti++) {
        const spec = traces[ti] as TraceSpec
        let v: number
        if (spec.from === 'output') {
          v = out
        } else if (spec.from === 'ctx') {
          const raw = spec.key !== undefined ? ctx[spec.key] : undefined
          v = typeof raw === 'number' ? raw : 0
        } else {
          const raw = spec.key !== undefined ? buf[spec.key] : undefined
          v = typeof raw === 'number' ? raw : 0
        }
        ;(rings[ti] as Float32Array)[head] =
          typeof v === 'number' && Number.isFinite(v) ? v : 0
      }
      head = (head + 1) % POINTS
      if (count < POINTS) count++

      g.clearRect(0, 0, WIDTH, HEIGHT)

      // Window band (behind everything) — the shaded [lo,hi] region on
      // the unipolar axis the phase ramp sweeps through. Drawn first so
      // the ramp and signal read on top of it.
      if (band) {
        const yLo = yUnipolar(paramVal(band.loKey))
        const yHi = yUnipolar(paramVal(band.hiKey))
        const top = Math.min(yLo, yHi)
        g.fillStyle = accent
        g.globalAlpha = 0.1
        g.fillRect(0, top, WIDTH, Math.abs(yLo - yHi))
        g.globalAlpha = 1
      }

      // Zero line — for bipolar the rest position; for unipolar the
      // signal floor (unipolar occupies the top half of the fixed
      // [-1, 1] range).
      g.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(0, mid)
      g.lineTo(WIDTH, mid)
      g.stroke()

      const start = head - count // index of the oldest sample (mod POINTS)
      const drawTrace = (ring: Float32Array, spec: TraceSpec) => {
        g.beginPath()
        for (let i = 0; i < count; i++) {
          const s = ring[(start + i + POINTS) % POINTS] as number
          const x = WIDTH - (count - 1 - i) * step
          const y = yFor(spec, s)
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
      }

      // Faint input / ctx traces first, flat and dim, no glow.
      g.strokeStyle = accent
      g.lineWidth = 1
      g.globalAlpha = 0.28
      for (let ti = 0; ti < traces.length; ti++) {
        const spec = traces[ti] as TraceSpec
        if (spec.style === 'faint') drawTrace(rings[ti] as Float32Array, spec)
      }
      g.globalAlpha = 1

      // Accent output trace on top, with the usual subtle glow.
      g.strokeStyle = accent
      g.lineWidth = 1.5
      g.shadowColor = accent
      g.shadowBlur = 4
      for (let ti = 0; ti < traces.length; ti++) {
        const spec = traces[ti] as TraceSpec
        if (spec.style === 'accent') drawTrace(rings[ti] as Float32Array, spec)
      }
      g.shadowBlur = 0

      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [def])

  return (
    <canvas
      ref={canvasRef}
      className="pd-source-preview"
      width={WIDTH}
      height={HEIGHT}
      aria-hidden="true"
    />
  )
}

/*
 * Demo recipes — how to make an otherwise-flat source preview
 * illustrative.
 *
 * Most stdlib sources animate on their own: an oscillator or a noise
 * run with factory-default params already traces a lively line. The
 * combinators (`add`, `mul`, `lerp`, `smooth`, `gate`, `phaseGate`)
 * do not — their inputs default to *constant* dials, so a preview of
 * one with default params is a dead flat line. There's nothing wrong
 * with the source; there's just no signal going into it.
 *
 * A recipe fixes that for the preview only. It says: before running
 * this instance, attach these demo oscillators to these input slots,
 * and (for phase-domain sources) advance this ctx field. It also names
 * which traces the sparkline should draw — the inputs faint, the
 * output in accent — so the viewer sees the combinator actually
 * combining.
 *
 * Recipes are a pure *preview* concern and live here, never in the
 * dials core: the source defs stay honest about their real factory
 * defaults (constants), and only the hover-card preview dresses them
 * up. A source with no recipe previews exactly as before — one accent
 * trace of its raw output.
 */

import { attachFrom, setDepth, type Source } from '@ldlework/dials'
import { sine, tri, square } from '@ldlework/dials'

/** Set a numeric param on the top-level preview instance by key. */
function tuneSelf(
  instance: Source<Record<string, unknown>, unknown>,
  key: string,
  value: number,
): void {
  const slot = instance.params[key]
  if (slot) (slot as { dial: { value: number } }).dial.value = value
}

/**
 * A trace the sparkline should draw. `input` reads a named param's
 * sampled value out of the instance's post-sample buffer; `output`
 * reads the source's own return. `faint` inputs sit behind the
 * `accent` output.
 */
export interface TraceSpec {
  from: 'input' | 'output' | 'ctx'
  /**
   * Source of the value: a param key (`from: 'input'`) or a ctx field
   * name (`from: 'ctx'`, e.g. `'phase'`). Ignored for `output`.
   */
  key?: string
  style: 'accent' | 'faint'
  /**
   * Plot on a unipolar [0,1] axis (0 at the bottom, 1 at the top)
   * instead of the default bipolar [-1,1] (0 at the midline). Use for
   * a phase ramp so it reads as a full-height sweep.
   */
  unipolar?: boolean
}

/**
 * A shaded horizontal window drawn behind the traces, marking the
 * `[lo, hi]` region on the unipolar axis — the phase window a gate is
 * open across. `loKey`/`hiKey` name the params holding the bounds.
 */
export interface BandSpec {
  loKey: string
  hiKey: string
}

/**
 * A demo recipe for one source. `wire` mutates a fresh private
 * instance (attach demo sources to its sub-slots, set depths);
 * `ctxPhaseRate`, if set, advances a `phase` field on the sample ctx
 * at that many cycles per second (for `ctx.phase`-domain sources like
 * `phaseGate`). `traces` lists what to draw; `band`, if set, shades the
 * open window behind them.
 */
export interface DemoRecipe {
  wire: (instance: Source<Record<string, unknown>, unknown>) => void
  ctxPhaseRate?: number
  traces: TraceSpec[]
  band?: BandSpec
}

/**
 * Attach a stdlib source to a named sub-slot of the instance. `def` is
 * `any` because the concrete stdlib defs don't structurally satisfy the
 * erased `SourceDef<Record<string, unknown>, unknown>` under
 * exactOptionalPropertyTypes — the same reason `STDLIB` casts. The
 * runtime `outType` guard in `attachFrom` is the real safety net.
 */
function drive(
  instance: Source<Record<string, unknown>, unknown>,
  key: string,
  def: any,
  depth: number,
  tune?: (src: Source<Record<string, unknown>, unknown>) => void,
): void {
  const slot = instance.params[key]
  if (!slot) return
  const src = attachFrom(slot, def)
  setDepth(slot, depth)
  tune?.(src)
}

/** Set a numeric param on a (sub-)source instance by key. */
function setParam(
  src: Source<Record<string, unknown>, unknown>,
  key: string,
  value: number,
): void {
  const slot = src.params[key]
  if (slot) slot.dial.value = value
}

const IN = (key: string): TraceSpec => ({ from: 'input', key, style: 'faint' })
const OUT: TraceSpec = { from: 'output', style: 'accent' }
/** A faint unipolar ctx-field trace — the phase ramp for the gates. */
const CTX = (key: string): TraceSpec => ({
  from: 'ctx',
  key,
  style: 'faint',
  unipolar: true,
})

/**
 * Recipes keyed by source name. Only the combinators that would
 * otherwise preview flat appear here; every other source previews as
 * its raw output with no recipe.
 */
export const DEMO_RECIPES: Record<string, DemoRecipe> = {
  // brown's default step rate barely moves in the short preview window —
  // bump it so the walk visibly wanders. No inputs to wire; just retune
  // the source's own `rate`.
  brown: {
    wire: (i) => tuneSelf(i, 'rate', 12),
    traces: [OUT],
  },
  add: {
    wire: (i) => {
      // A slow carrier plus a ripple at 3× — a clean 3:1 ratio so the
      // pattern repeats and you can watch the fast wave ride the slow
      // one.
      drive(i, 'a', sine, 1, (s) => setParam(s, 'freq', 0.3))
      drive(i, 'b', sine, 1, (s) => setParam(s, 'freq', 0.9))
    },
    traces: [IN('a'), IN('b'), OUT],
  },
  mul: {
    wire: (i) => {
      // A slow tone amplitude-modulated by one at 3× — classic AM, the
      // product pinches to zero wherever either input crosses. Clean
      // 3:1 ratio keeps it periodic and readable.
      drive(i, 'a', sine, 1, (s) => setParam(s, 'freq', 0.3))
      drive(i, 'b', sine, 1, (s) => setParam(s, 'freq', 0.9))
    },
    traces: [IN('a'), IN('b'), OUT],
  },
  lerp: {
    wire: (i) => {
      // Two steady tones and a slow blend sweeping between them.
      drive(i, 'a', sine, 1, (s) => setParam(s, 'freq', 1.2))
      drive(i, 'b', tri, 1, (s) => setParam(s, 'freq', 0.5))
      drive(i, 't', sine, 0.5, (s) => setParam(s, 'freq', 0.3))
    },
    traces: [IN('a'), IN('b'), OUT],
  },
  smooth: {
    wire: (i) => {
      // A hard square in, a rounded curve out — the lowpass made
      // visible.
      drive(i, 'signal', square, 1, (s) => setParam(s, 'freq', 0.6))
    },
    traces: [IN('signal'), OUT],
  },
  gate: {
    wire: (i) => {
      // Let a tone through only inside the timed window; the rest of
      // the cycle sits at the floor.
      drive(i, 'signal', sine, 1, (s) => setParam(s, 'freq', 3))
    },
    traces: [IN('signal'), OUT],
  },
  phaseGate: {
    // phaseGate reads ctx.phase, not time — so the demo draws the phase
    // ramp itself (the faint unipolar sweep) and shades the [lo,hi]
    // window. The signal passes exactly while the ramp is inside the
    // band: that's "gated by phase position", not a periodic timer.
    ctxPhaseRate: 0.35,
    wire: (i) => {
      drive(i, 'signal', sine, 1, (s) => setParam(s, 'freq', 3))
    },
    traces: [CTX('phase'), IN('signal'), OUT],
    band: { loKey: 'lo', hiKey: 'hi' },
  },
}

/** The default when no recipe is registered — one accent output trace. */
export const DEFAULT_TRACES: TraceSpec[] = [OUT]

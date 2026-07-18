/**
 * The standard library of sources. Auto-registered when the package
 * is imported.
 *
 * Convention: every source's `body` reads time from `ctx.t` (a number,
 * seconds). Sources that read a phase domain read `ctx[phaseKey]` where
 * `phaseKey` is itself a `dial<string>` — but for v1 we keep it simple
 * and use a fixed key per source (configurable later if it bites).
 *
 * Stateful sources (`smooth`, `valueNoise`, `ramp`) hold their state
 * in a closure created at instantiation time. Each `instantiate()`
 * call gets its own state — two `smooth` instances on different slots
 * never share memory.
 */

import type { Ctx, Slot, SourceDef } from './core'
import { dial } from './dial'
import {
  defineSource,
  defineStatefulSource,
  registerSource,
  type ParamSpec,
} from './source'

// ─── helpers ───────────────────────────────────────────────────────────

/** Convenience for stdlib param defs — every param is a number dial. */
function num(
  value: number,
  min: number,
  max: number,
  label?: string,
): ParamSpec<number> {
  return {
    type: 'number',
    slot: () => dial(value, { min, max, label }),
  }
}

/**
 * Like `num`, but the slider scales logarithmically — useful for any
 * quantity humans tune in log space (frequencies, time constants).
 * Requires min > 0.
 */
function logNum(
  value: number,
  min: number,
  max: number,
  label?: string,
): ParamSpec<number> {
  return {
    type: 'number',
    slot: () => dial(value, { min, max, label, scale: 'log' }),
  }
}

/**
 * Seed an oscillator/noise source's `lo` and `hi` (the value range
 * it sweeps between) from the host slot it's being attached to.
 *
 * If the host carries `min`/`max` metadata, the source's lo/hi are
 * initialized to exactly that — so the source naturally produces
 * values inside the host's valid range, with no clamping. The
 * source's own lo/hi sliders also inherit the host's min/max as
 * their UI range, so the user can't push them outside.
 *
 * If the host has no range metadata, lo/hi stay at the source's
 * factory defaults (typically -1, 1).
 *
 * Also defaults the slider step from the host (so e.g. dragging
 * lo/hi on a "freq" dial steps by 1 Hz, not 0.001).
 */
function seedRangeFromHost(
  loSlot: Slot<number>,
  hiSlot: Slot<number>,
  host: Slot<unknown>,
): void {
  const narrowed = narrowHostMeta(host)
  if (!narrowed) return
  loSlot.dial.value = narrowed.min
  hiSlot.dial.value = narrowed.max
  inheritRangeMeta(loSlot, narrowed)
  inheritRangeMeta(hiSlot, narrowed)
}

function narrowHostMeta(
  host: Slot<unknown>,
): { min: number; max: number; step?: number } | null {
  const meta = host.dial.meta as { min?: number; max?: number; step?: number }
  if (typeof meta.min !== 'number' || typeof meta.max !== 'number') return null
  if (meta.max <= meta.min) return null
  return { min: meta.min, max: meta.max, step: meta.step }
}

/**
 * Copy the host's min/max/step onto a single sub-slot so its slider
 * lives in the host's units. Used by pass-through / combinator
 * sources whose output value lives on a specific sub-dial (smooth's
 * `signal`, clamp's `signal`, gate's `signal` / `closed`, etc.).
 *
 * Also re-clamps the current value into the new range, so a freshly
 * attached source starts from the host's current value when possible.
 */
function seedPassThroughFromHost(
  passSlot: Slot<number>,
  host: Slot<unknown>,
  opts?: { startAtHostValue?: boolean },
): void {
  const narrowed = narrowHostMeta(host)
  if (!narrowed) return
  inheritRangeMeta(passSlot, narrowed)
  if (opts?.startAtHostValue) {
    const hv = host.dial.value
    if (typeof hv === 'number') passSlot.dial.value = hv
  } else {
    const v = passSlot.dial.value
    if (typeof v === 'number') {
      passSlot.dial.value = Math.max(narrowed.min, Math.min(narrowed.max, v))
    }
  }
}

function inheritRangeMeta(
  slot: Slot<unknown>,
  host: { min: number; max: number; step?: number },
): void {
  const m = slot.dial.meta as { min?: number; max?: number; step?: number }
  m.min = host.min
  m.max = host.max
  if (typeof host.step === 'number') m.step = host.step
}

/** Read `ctx.t` as a number, defaulting to 0. */
function getT(ctx: Ctx): number {
  const t = ctx['t']
  return typeof t === 'number' ? t : 0
}

/** Read `ctx.dt` as a number, defaulting to 1/60. */
function getDt(ctx: Ctx): number {
  const dt = ctx['dt']
  return typeof dt === 'number' ? dt : 1 / 60
}

/** Mulberry32 — small fast seeded RNG, deterministic from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── shape sources ─────────────────────────────────────────────────────

/**
 * `sine` — `center + sin(2π * freq * t + phase) * depth`.
 * Free-running on wall-clock `ctx.t`.
 */
export const sine = defineSource({
  name: 'sine',
  description: 'Pure sinusoidal oscillation between lo and hi at the given frequency. Smooth, mathematically clean — the classic LFO shape. Reach for this when you want a predictable cyclic wobble.',
  outType: 'number',
  params: {
    lo:    num(-1, -10000, 10000,  'lo'),
    hi:    num(1,  -10000, 10000,  'hi'),
    freq:  logNum(1, 0.01, 20, 'freq (Hz)'),
    phase: num(0,  0,      6.2832, 'phase'),
  },
  body: ({ lo, hi, freq, phase }, ctx) => {
    const s = Math.sin(2 * Math.PI * freq * getT(ctx) + phase)
    return lo + ((s + 1) * 0.5) * (hi - lo)
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

/**
 * `lfo` — alias for `sine` with friendlier defaults. Same body.
 * Defined separately so the picker shows it as its own choice (a user
 * editing a frequency dial thinks "modulate with LFO," not "with a
 * sine wave"). Cheap to have both.
 */
/**
 * `tri` — triangle wave in [-1, 1] before depth/center scaling.
 */
export const tri = defineSource({
  name: 'tri',
  description: 'Triangle wave — linear ramps up and down between lo and hi. Sharper transitions than sine; the value spends less time near the extremes.',
  outType: 'number',
  params: {
    lo:    num(-1, -10000, 10000, 'lo'),
    hi:    num(1,  -10000, 10000, 'hi'),
    freq:  logNum(1, 0.01, 20, 'freq (Hz)'),
    phase: num(0,  0,      1,     'phase'),
  },
  body: ({ lo, hi, freq, phase }, ctx) => {
    const p = (freq * getT(ctx) + phase) % 1
    const t = p < 0.5 ? 4 * p - 1 : 3 - 4 * p   // [-1, 1]
    return lo + ((t + 1) * 0.5) * (hi - lo)
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

/**
 * `saw` — rising sawtooth in [-1, 1].
 */
export const saw = defineSource({
  name: 'saw',
  description: 'Sawtooth ramp — climbs linearly from lo to hi, then snaps back. Use for steady builds with sudden resets.',
  outType: 'number',
  params: {
    lo:    num(-1, -10000, 10000, 'lo'),
    hi:    num(1,  -10000, 10000, 'hi'),
    freq:  logNum(1, 0.01, 20, 'freq (Hz)'),
    phase: num(0,  0,      1,     'phase'),
  },
  body: ({ lo, hi, freq, phase }, ctx) => {
    const p = (freq * getT(ctx) + phase) % 1
    // p is already [0, 1) — direct ramp.
    return lo + p * (hi - lo)
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

/**
 * `square` — duty-cycle-able pulse in {-1, +1}.
 */
export const square = defineSource({
  name: 'square',
  description: 'Pulse wave — flips between hi (for `duty` of the cycle) and lo (the rest). Use for hard on/off switching, gates, or stuttering effects.',
  outType: 'number',
  params: {
    lo:    num(-1,  -10000, 10000, 'lo'),
    hi:    num(1,   -10000, 10000, 'hi'),
    freq:  logNum(1, 0.01, 20, 'freq (Hz)'),
    duty:  num(0.5, 0,      1,     'duty'),
    phase: num(0,   0,      1,     'phase'),
  },
  body: ({ lo, hi, freq, duty, phase }, ctx) => {
    const p = (freq * getT(ctx) + phase) % 1
    return p < duty ? hi : lo
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

// ─── noise ─────────────────────────────────────────────────────────────

/**
 * `whiteNoise` — uniform random in `[center - depth, center + depth]`.
 * Seeded; each `instantiate` gets its own RNG stream. Body is a
 * factory so per-instance RNG state is isolated.
 */
export const whiteNoise = defineStatefulSource({
  name: 'whiteNoise',
  description: 'Uniform random samples between lo and hi, one per frame. Seeded — same seed reproduces the same sequence. Harsh, "TV static" texture; no correlation between consecutive samples.',
  outType: 'number',
  params: {
    seed: num(1,  1,      9999,  'seed'),
    lo:   num(-1, -10000, 10000, 'lo'),
    hi:   num(1,  -10000, 10000, 'hi'),
  },
  body: () => {
    let rng: (() => number) | null = null
    let lastSeed = NaN
    return ({ seed, lo, hi }) => {
      if (seed !== lastSeed) {
        rng = mulberry32(Math.floor(seed))
        lastSeed = seed
      }
      // rng returns [0, 1) — straight remap to [lo, hi].
      return lo + rng!() * (hi - lo)
    }
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

/**
 * `valueNoise` — smooth random walk, cosine-eased between deterministic
 * control points at `rate` points-per-second. Output in roughly
 * `[center - depth, center + depth]`. Stateless body actually —
 * deterministic from (seed, t) — but defined as a factory anyway so
 * the hash table lookup doesn't allocate per call.
 */
export const valueNoise = defineStatefulSource({
  name: 'valueNoise',
  description: 'Smooth random walk — deterministic random samples (one per time-unit) cosine-eased together. Cheaper than perlin1D, with a slight bias near integer boundaries. Good cheap "organic wobble" texture.',
  outType: 'number',
  params: {
    seed: num(1,  1,      9999,  'seed'),
    lo:   num(-1, -10000, 10000, 'lo'),
    hi:   num(1,  -10000, 10000, 'hi'),
    rate: logNum(1, 0.01, 20, 'rate (pts/s)'),
  },
  body: () => {
    const hash = (seed: number, n: number) => {
      const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
      return v - Math.floor(v)
    }
    const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t)
    return ({ seed, lo, hi, rate }, ctx) => {
      const phase = rate * getT(ctx)
      const i = Math.floor(phase)
      const f = phase - i
      const a = hash(seed, i)
      const b = hash(seed, i + 1)
      const u = a + (b - a) * ease(f)              // [0, 1]
      return lo + u * (hi - lo)
    }
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

// ─── perlin family ────────────────────────────────────────────────────
//
// Classic 1D Perlin noise: gradient noise interpolated with the
// fade(t) = 6t⁵ − 15t⁴ + 10t³ quintic curve so the output is C²
// continuous. Character: smoother and more "natural" than valueNoise,
// and the gradient interpolation produces a balanced [-1, 1] output
// without the slight bias valueNoise has near integer boundaries.

/** fade(t) = 6t^5 - 15t^4 + 10t^3 — Perlin's improved fade. */
function perlinFade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Per-grid-point gradient in 1D — really just a signed scalar in
 * [-1, 1]. Deterministic from (seed, integer index).
 */
function gradient1D(seed: number, i: number): number {
  // Same sin-based hash as valueNoise, remapped to signed.
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
  return (v - Math.floor(v)) * 2 - 1
}

/**
 * `perlin1D` — classic 1D Perlin gradient noise, eased with the
 * quintic fade. Output naturally lives in roughly [-1, 1] (a bit
 * tighter in practice, ~±0.5), then remapped to [lo, hi]. Smoother
 * than valueNoise; the C² continuity makes it the right choice for
 * driving anything where you don't want visible "corners" in the
 * motion.
 */
export const perlin1D = defineStatefulSource({
  name: 'perlin1D',
  description: 'Classic 1D Perlin gradient noise. Smoother than valueNoise — C² continuous, so no visible corners in the motion. Reach for this when you want the cleanest, most natural-feeling organic drift.',
  outType: 'number',
  params: {
    seed: num(1,  1,      9999,  'seed'),
    lo:   num(-1, -10000, 10000, 'lo'),
    hi:   num(1,  -10000, 10000, 'hi'),
    rate: logNum(1, 0.01, 20, 'rate (units/s)'),
  },
  body: () => {
    return ({ seed, lo, hi, rate }, ctx) => {
      const x = rate * getT(ctx)
      const i = Math.floor(x)
      const f = x - i
      const g0 = gradient1D(seed, i)
      const g1 = gradient1D(seed, i + 1)
      // dot(gradient, distance) at each endpoint. With gradients in
      // [-1, 1] and f in [0, 1], each d is in [-1, 1].
      const d0 = g0 * f
      const d1 = g1 * (f - 1)
      const u = perlinFade(f)
      const n = d0 + u * (d1 - d0)
      // Normalize: 1D perlin with [-1, 1] gradients reaches its
      // theoretical extrema of ±0.5 at midpoints when adjacent
      // gradients are maximally opposed (g0 = +1, g1 = -1, or vice
      // versa). Most steps will be much smaller, but the user wants
      // the full [lo, hi] range to be reachable in practice, so we
      // scale by 2× and clamp. Yes, this means typical motion only
      // covers part of the range — but you CAN see the extremes.
      const t = Math.max(0, Math.min(1, n + 0.5))
      return lo + t * (hi - lo)
    }
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

/**
 * `fbm` — fractional Brownian motion. Stack `octaves` octaves of
 * perlin1D, each at double the frequency and half the amplitude.
 * Produces noise with self-similar detail across scales — the cloud-
 * like / terrain-like character you reach for when smooth Perlin
 * feels too plain.
 *
 *   octaves    1..6 typical. More = more detail, more CPU.
 *   lacunarity frequency multiplier per octave (default 2)
 *   gain       amplitude multiplier per octave (default 0.5)
 */
export const fbm = defineStatefulSource({
  name: 'fbm',
  description: 'Fractional Brownian motion — perlin noise stacked across several octaves at progressively higher frequencies and lower amplitudes. Cloud-like / terrain-like texture: smooth overall shape with fine detail layered on top. More CPU than perlin1D.',
  outType: 'number',
  params: {
    seed:       num(1, 1,      9999,  'seed'),
    lo:         num(-1, -10000, 10000, 'lo'),
    hi:         num(1,  -10000, 10000, 'hi'),
    rate:       logNum(1, 0.01, 20, 'rate (units/s)'),
    octaves:    num(4,  1,      6,     'octaves'),
    lacunarity: num(2,  1.01,   4,     'lacunarity'),
    gain:       num(0.5, 0.05,  0.95,  'gain'),
  },
  body: () => {
    return ({ seed, lo, hi, rate, octaves, lacunarity, gain }, ctx) => {
      const t = rate * getT(ctx)
      const N = Math.max(1, Math.floor(octaves))
      let freq = 1
      let amp = 1
      let sum = 0
      let norm = 0
      for (let o = 0; o < N; o++) {
        const x = t * freq
        const i = Math.floor(x)
        const f = x - i
        // Decorrelate octaves by offsetting the seed per-octave so
        // they don't all wobble at the same instants.
        const s = seed + o * 131
        const g0 = gradient1D(s, i)
        const g1 = gradient1D(s, i + 1)
        const d0 = g0 * f
        const d1 = g1 * (f - 1)
        const u = perlinFade(f)
        sum += amp * (d0 + u * (d1 - d0))
        norm += amp
        freq *= lacunarity
        amp *= gain
      }
      // sum/norm is a weighted average of N octaves. As N grows the
      // distribution clusters around 0 (CLT-ish), so we stretch the
      // dynamic range proportional to N to keep the output spanning
      // [lo, hi] in practice. The 1.4 factor was tuned empirically
      // to make 4-octave fbm reach near the bounds.
      const n = (sum / Math.max(norm, 1e-6)) * 1.4
      const tNorm = Math.max(0, Math.min(1, n + 0.5))
      return lo + tNorm * (hi - lo)
    }
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

/**
 * `brown` — brownian (red) noise. Random walk: each frame's value is
 * the previous value plus a small seeded step. Slow, drifting
 * character — feels like organic instability rather than the
 * intentional shape of perlin or sine. Tends to wander; clamped to
 * [lo, hi] with a soft reflection so it doesn't pin to either edge.
 *
 * Stateful: the walk state lives per-instance.
 */
export const brown = defineStatefulSource({
  name: 'brown',
  description: 'Brownian (red) noise — random walk that drifts slowly, reflecting off the [lo, hi] boundaries. Feels like organic instability rather than intentional shape. Stateful: each instance has its own walk.',
  outType: 'number',
  params: {
    seed: num(1,  1,      9999,  'seed'),
    lo:   num(-1, -10000, 10000, 'lo'),
    hi:   num(1,  -10000, 10000, 'hi'),
    rate: logNum(1, 0.01, 50, 'step rate'),
  },
  body: () => {
    let rng: (() => number) | null = null
    let lastSeed = NaN
    let y = 0.5                                       // walk position in [0, 1]
    return ({ seed, lo, hi, rate }, ctx) => {
      if (seed !== lastSeed) {
        rng = mulberry32(Math.floor(seed))
        lastSeed = seed
        y = 0.5
      }
      // Step size proportional to dt * rate, so changing dt doesn't
      // change the apparent speed. Step is in unit space; we reflect
      // off [0, 1] so the walk stays bounded.
      const step = (rng!() * 2 - 1) * Math.min(1, getDt(ctx) * rate)
      y += step * 0.1
      if (y < 0) y = -y
      if (y > 1) y = 2 - y
      if (y < 0) y = 0
      if (y > 1) y = 1
      return lo + y * (hi - lo)
    }
  },
  onAttach: (p, host) => seedRangeFromHost(p.lo, p.hi, host),
})

// ─── time / integration ────────────────────────────────────────────────

/**
 * `ramp` — linearly accumulates `rate` per second since instantiation.
 * Useful as a custom phase source feeding into oscillators. Stateful:
 * each instance has its own accumulator.
 */
export const ramp = defineStatefulSource({
  name: 'ramp',
  description: 'Linearly accumulates `rate` per second. Unbounded by design — feed it into other sources or use it as a custom phase counter. `reset > 0` zeros the accumulator on the rising edge.',
  outType: 'number',
  params: {
    rate:  num(1, -10, 10, 'rate (units/s)'),
    reset: num(0,  0,  1,  'reset on >0'),
  },
  body: () => {
    let acc = 0
    let lastReset = 0
    return ({ rate, reset }, ctx) => {
      if (reset > 0 && lastReset === 0) acc = 0
      lastReset = reset
      acc += rate * getDt(ctx)
      return acc
    }
  },
})

// ─── filters ───────────────────────────────────────────────────────────

/**
 * `smooth` — one-pole lowpass on `signal` with time constant `tau`
 * (seconds). Reads `ctx.dt`. Stateful; first sample initializes to
 * `signal`. Useful for de-jittering modulators. Each instance has its
 * own filter memory.
 */
export const smooth = defineStatefulSource({
  name: 'smooth',
  description: 'One-pole lowpass filter on its `signal` input. Use to de-jitter a fast/noisy modulator — set `tau` to the rough timescale you want to smooth over (in seconds). The signal dial itself is modulatable.',
  outType: 'number',
  params: {
    signal: num(0, -1000, 1000, 'signal'),
    tau:    logNum(0.1, 0.001, 5, 'tau (s)'),
  },
  body: () => {
    let y = NaN
    return ({ signal, tau }, ctx) => {
      if (!Number.isFinite(y)) y = signal
      const dt = getDt(ctx)
      const alpha = 1 - Math.exp(-dt / Math.max(tau, 1e-6))
      y = y + (signal - y) * alpha
      return y
    }
  },
  onAttach: (p, host) => seedPassThroughFromHost(p.signal, host, { startAtHostValue: true }),
})

// ─── combinators ───────────────────────────────────────────────────────

/**
 * `add` — `a + b`. Both modulatable.
 */
export const add = defineSource({
  name: 'add',
  description: 'Sum of two modulators. Useful for layering — e.g. a slow drift plus a fast jitter. Note the output can overshoot the host range; chain a clamp if that matters.',
  outType: 'number',
  params: {
    a: num(0, -1000, 1000, 'a'),
    b: num(0, -1000, 1000, 'b'),
  },
  body: ({ a, b }) => a + b,
  // Sum of two terms each inheriting host's range — gives the user
  // sensible slider bounds even though the actual output can overshoot.
  onAttach: (p, host) => {
    seedPassThroughFromHost(p.a, host)
    seedPassThroughFromHost(p.b, host)
  },
})

/**
 * `mul` — `a * b`. Both modulatable.
 */
export const mul = defineSource({
  name: 'mul',
  description: 'Product of two modulators. Classic use: amplitude-modulate one source by another (envelope × oscillator). `a` inherits the host range; `b` stays as a small unit-less multiplier.',
  outType: 'number',
  params: {
    a: num(1, -1000, 1000, 'a'),
    b: num(1, -1000, 1000, 'b'),
  },
  body: ({ a, b }) => a * b,
  // Multiplication is unitless — only `a` inherits the host range,
  // `b` stays as a small multiplier knob. Caller can re-attach
  // anything modulated to `b` to get unit-correct behavior.
  onAttach: (p, host) => seedPassThroughFromHost(p.a, host),
})

/**
 * `lerp` — linear interpolate between `a` and `b` by `t ∈ [0, 1]`.
 * No clamp on `t` — values outside [0,1] extrapolate, by design.
 */
export const lerp = defineSource({
  name: 'lerp',
  description: 'Linear interpolation between `a` and `b` controlled by `t`. The most direct way to "mix between two states" — attach a sine to `t` to oscillate cleanly between two configurable extremes.',
  outType: 'number',
  params: {
    a: num(0, -1000, 1000, 'a'),
    b: num(1, -1000, 1000, 'b'),
    t: num(0.5, 0,     1,  't'),
  },
  body: ({ a, b, t }) => a + (b - a) * t,
  // Endpoints inherit host range; `t` stays as a 0..1 knob.
  onAttach: (p, host) => {
    seedPassThroughFromHost(p.a, host)
    seedPassThroughFromHost(p.b, host)
    // Seed `a`=host min, `b`=host max so the default lerp sweeps the
    // full range as t goes 0→1.
    const meta = host.dial.meta as { min?: number; max?: number }
    if (typeof meta.min === 'number' && typeof meta.max === 'number') {
      p.a.dial.value = meta.min
      p.b.dial.value = meta.max
    }
  },
})

/**
 * `clamp` — `min(max(signal, lo), hi)`.
 */
export const clamp = defineSource({
  name: 'clamp',
  description: 'Hard-clamps `signal` into [lo, hi]. Useful when a chain of math overshoots and you need to guarantee bounds. Defaults to a no-op until you tighten the bounds.',
  outType: 'number',
  params: {
    signal: num(0, -1000, 1000, 'signal'),
    lo:     num(0, -1000, 1000, 'lo'),
    hi:     num(1, -1000, 1000, 'hi'),
  },
  body: ({ signal, lo, hi }) =>
    signal < lo ? lo : signal > hi ? hi : signal,
  // signal + bounds all inherit host range. Default lo=host.min,
  // hi=host.max so by default the clamp is a no-op until tightened.
  onAttach: (p, host) => {
    seedPassThroughFromHost(p.signal, host, { startAtHostValue: true })
    seedRangeFromHost(p.lo, p.hi, host)
  },
})

/**
 * `remap` — linear map from `[inLo, inHi]` to `[outLo, outHi]`. Useful
 * for taking a `[-1, 1]` LFO and putting it in `[0, 1]` for a gate or
 * a 0-bounded knob.
 */
export const remap = defineSource({
  name: 'remap',
  description: 'Linear map from [inLo, inHi] to [outLo, outHi]. Use to convert a modulator producing one range (e.g. a sine in [-1, 1]) into another (a [0, 1] gate, a [200, 800] freq window). Like a manual unit converter.',
  outType: 'number',
  params: {
    signal: num(0,  -1000, 1000, 'signal'),
    inLo:   num(-1, -1000, 1000, 'in lo'),
    inHi:   num(1,  -1000, 1000, 'in hi'),
    outLo:  num(0,  -1000, 1000, 'out lo'),
    outHi:  num(1,  -1000, 1000, 'out hi'),
  },
  body: ({ signal, inLo, inHi, outLo, outHi }) => {
    const range = inHi - inLo
    if (range === 0) return outLo
    const f = (signal - inLo) / range
    return outLo + f * (outHi - outLo)
  },
  // Output side inherits host range; input side stays at its factory
  // [-1, 1] default (since that's the typical source-of-modulators
  // range — e.g. a sine).
  onAttach: (p, host) => seedRangeFromHost(p.outLo, p.outHi, host),
})

// ─── gating ────────────────────────────────────────────────────────────

/**
 * `gate` — passes `signal` through when `ctx.t * 1` lies in
 * `[lo, hi]` mod `period`; otherwise returns `closed`. The window is
 * specified in seconds; for phase-locked gating against a non-time
 * domain, use `phaseGate`.
 *
 * Common use: gate a sub-modulator to only fire during a portion of a
 * cyclic event.
 */
export const gate = defineSource({
  name: 'gate',
  description: 'Time-based gate. Outputs `signal` only inside the [lo, hi] window of each `period`-second cycle, otherwise outputs `closed`. Use for rhythmic bursts whose timing is independent of any external phase.',
  outType: 'number',
  params: {
    signal: num(0, -1000, 1000, 'signal'),
    closed: num(0, -1000, 1000, 'closed value'),
    period: num(1, 0.001, 60,   'period (s)'),
    lo:     num(0, 0,     1,    'open at (frac)'),
    hi:     num(0.5, 0,   1,    'close at (frac)'),
  },
  body: ({ signal, closed, period, lo, hi }, ctx) => {
    const p = (getT(ctx) / period) % 1
    return p >= lo && p < hi ? signal : closed
  },
  onAttach: (p, host) => {
    seedPassThroughFromHost(p.signal, host, { startAtHostValue: true })
    seedPassThroughFromHost(p.closed, host)
  },
})

/**
 * `phaseGate` — like `gate` but reads `ctx.phase` (a number in
 * `[0, 1]`) directly instead of deriving phase from `t`. For
 * oscilloscope sweep windows, beat-relative timing, etc.: have the
 * app populate `ctx.phase` from whatever clock matters.
 */
export const phaseGate = defineSource({
  name: 'phaseGate',
  description: 'Like `gate`, but the gating phase comes from `ctx.phase` (a number in [0, 1]) supplied by the host — e.g. an oscilloscope sweep position, a beat-relative clock. Use for events that need to lock to an external rhythm.',
  outType: 'number',
  params: {
    signal: num(0, -1000, 1000, 'signal'),
    closed: num(0, -1000, 1000, 'closed value'),
    lo:     num(0,   0,   1,    'open at'),
    hi:     num(0.5, 0,   1,    'close at'),
  },
  body: ({ signal, closed, lo, hi }, ctx) => {
    const p = ctx['phase']
    const phase = typeof p === 'number' ? p : 0
    return phase >= lo && phase < hi ? signal : closed
  },
  onAttach: (p, host) => {
    seedPassThroughFromHost(p.signal, host, { startAtHostValue: true })
    seedPassThroughFromHost(p.closed, host)
  },
})

// ─── registration ──────────────────────────────────────────────────────

/**
 * Every stdlib source, in one list. Imported by `index.ts` which
 * auto-registers them.
 */
export const STDLIB: SourceDef<Record<string, unknown>, unknown>[] = [
  sine,
  tri,
  saw,
  square,
  whiteNoise,
  valueNoise,
  perlin1D,
  fbm,
  brown,
  ramp,
  smooth,
  add,
  mul,
  lerp,
  clamp,
  remap,
  gate,
  phaseGate,
] as unknown as SourceDef<Record<string, unknown>, unknown>[]

/**
 * Register every stdlib source. Called at package-import time by
 * `index.ts`; idempotent — re-running just re-registers.
 */
export function registerStdlib(): void {
  for (const def of STDLIB) registerSource(def)
}

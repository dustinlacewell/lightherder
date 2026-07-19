import { describe, expect, it } from 'vitest'
import {
  attach,
  defineSource,
  dial,
  instantiate,
  read,
  sampleSlot,
  setDepth,
  setMode,
  typedDial,
  type ModMode,
  type Slot,
  type Source,
} from '../src'

/**
 * Attach a source and set the slot's modulation depth (and optional
 * mode) in one call — depth and mode are now slot properties, so this
 * replaces the old `attach(slot, src, depth, mode)` shorthand these
 * combine tests were written against. Semantics are identical.
 */
function attachAt<T>(
  slot: Slot<T>,
  source: Source<Record<string, unknown>, T>,
  depth: number,
  mode?: ModMode,
): Slot<T> {
  attach(slot, source)
  setDepth(slot, depth)
  if (mode) setMode(slot, mode)
  return slot
}

const passThrough = defineSource({
  name: 'test.passThrough',
  outType: 'number',
  polarity: 'bipolar',
  params: { x: { type: 'number', slot: () => dial(0) } },
  body: ({ x }) => x,
})

const uniPassThrough = defineSource({
  name: 'test.uniPassThrough',
  outType: 'number',
  polarity: 'unipolar',
  params: { x: { type: 'number', slot: () => dial(0) } },
  body: ({ x }) => x,
})

const fromCtx = defineSource({
  name: 'test.fromCtx',
  outType: 'number',
  polarity: 'bipolar',
  params: {},
  body: (_, ctx) => (ctx.t as number) ?? -1,
})

const strSrc = defineSource({
  name: 'test.str',
  outType: 'str',
  polarity: 'bipolar',
  params: {},
  body: () => 'from-source',
})

/** Instantiate passThrough with its `x` sub-dial preset to `v`. */
function signal(v: number) {
  const src = instantiate(passThrough)
  src.params.x.dial.value = v
  return src
}

/** A unipolar source emitting the constant `v`. */
function uniSignal(v: number) {
  const src = instantiate(uniPassThrough)
  src.params.x.dial.value = v
  return src
}

describe('read()', () => {
  it('returns a record with one entry per slot', () => {
    const params = { a: dial(1), b: dial(2) }
    expect(read(params, {})).toEqual({ a: 1, b: 2 })
  })

  it('passes ctx through to sources', () => {
    const params = { now: dial(0) }
    attachAt(params.now, instantiate(fromCtx), 1)
    expect(read(params, { t: 99 }).now).toBe(99)
  })

  it('handles an empty dials object', () => {
    expect(read({}, {})).toEqual({})
  })

  it('returns the SAME object reference every call (buffer reuse)', () => {
    const params = { a: dial(1) }
    const r1 = read(params, {})
    const r2 = read(params, {})
    expect(r1).toBe(r2)
  })

  it('returns DIFFERENT objects for different dials records', () => {
    const a = { x: dial(1) }
    const b = { x: dial(1) }
    expect(read(a, {})).not.toBe(read(b, {}))
  })

  it('reflects dial mutations on the next read', () => {
    const params = { v: dial(0) }
    expect(read(params, {}).v).toBe(0)
    params.v.dial.value = 42
    expect(read(params, {}).v).toBe(42)
  })

  it('reflects attach/detach on the next read', () => {
    const params = { v: dial(7) }
    expect(read(params, {}).v).toBe(7)
    // No range metadata → value-space combine: 7 + 1·100 = 107.
    attachAt(params.v, signal(100), 1)
    expect(read(params, {}).v).toBe(107)
    params.v.attached = null
    expect(read(params, {}).v).toBe(7)
  })
})

describe('combine semantics', () => {
  it('adds depth·signal in position space on a ranged slot', () => {
    // base 0.5 on [0, 1] → pos 0.5; + 0.25·1 → pos 0.75 → value 0.75.
    const s = dial(0.5, { min: 0, max: 1 })
    attachAt(s, signal(1), 0.25)
    expect(sampleSlot(s, {})).toBeCloseTo(0.75)
  })

  it('a bipolar signal swings both ways around the base', () => {
    const up = dial(0.5, { min: 0, max: 1 })
    attachAt(up, signal(1), 0.2)
    expect(sampleSlot(up, {})).toBeCloseTo(0.7)
    const down = dial(0.5, { min: 0, max: 1 })
    attachAt(down, signal(-1), 0.2)
    expect(sampleSlot(down, {})).toBeCloseTo(0.3)
  })

  it('a full swing touches the range ends exactly', () => {
    const hi = dial(0.9, { min: 0, max: 1 })
    attachAt(hi, signal(1), 0.25)
    expect(sampleSlot(hi, {})).toBe(1)
    const lo = dial(0.1, { min: 0, max: 1 })
    attachAt(lo, signal(-1), 0.25)
    expect(sampleSlot(lo, {})).toBe(0)
  })

  it('excursions past an extent scale into the remaining room, not clip', () => {
    // base 0.9, depth 0.25: only 0.1 of travel remains upward, so the
    // positive half of the signal maps into it — a half signal lands
    // halfway there (0.95), NOT at the old clamp's pinned 1.0.
    const s = dial(0.9, { min: 0, max: 1 })
    attachAt(s, signal(0.5), 0.25)
    expect(sampleSlot(s, {})).toBeCloseTo(0.95)
    // Downward there is plenty of room, so the negative half keeps
    // the full depth: 0.9 − 0.25·0.5 = 0.775.
    const t = dial(0.9, { min: 0, max: 1 })
    attachAt(t, signal(-0.5), 0.25)
    expect(sampleSlot(t, {})).toBeCloseTo(0.775)
  })

  it('per-side scaling is asymmetric off-center at full depth', () => {
    // base 0.75, full depth: up has 0.25 of room, down has 0.75.
    const up = dial(0.75, { min: 0, max: 1 })
    attachAt(up, signal(0.5), 1)
    expect(sampleSlot(up, {})).toBeCloseTo(0.875)
    const down = dial(0.75, { min: 0, max: 1 })
    attachAt(down, signal(-0.5), 1)
    expect(sampleSlot(down, {})).toBeCloseTo(0.375)
  })

  it('scales with the range, not raw units', () => {
    // base 50 on [0, 100] → pos 0.5; + 0.1·1 → pos 0.6 → value 60.
    const s = dial(50, { min: 0, max: 100 })
    attachAt(s, signal(1), 0.1)
    expect(sampleSlot(s, {})).toBeCloseTo(60)
  })

  it('combines through position space on log-scale slots (geometric symmetry)', () => {
    // base 100 on log [10, 1000] → pos 0.5. Equal ±signal must move
    // the value by equal *ratios*, not equal differences.
    const upSlot = dial(100, { min: 10, max: 1000, scale: 'log' })
    attachAt(upSlot, signal(0.5), 0.5)
    const up = sampleSlot(upSlot, {}) as number
    const downSlot = dial(100, { min: 10, max: 1000, scale: 'log' })
    attachAt(downSlot, signal(-0.5), 0.5)
    const down = sampleSlot(downSlot, {}) as number
    expect(up).toBeCloseTo(Math.pow(10, 2.5)) // pos 0.75
    expect(down).toBeCloseTo(Math.pow(10, 1.5)) // pos 0.25
    expect(up / 100).toBeCloseTo(100 / down)
  })

  it('log-scale slot clamps to the range ends at full swing', () => {
    const s = dial(100, { min: 10, max: 1000, scale: 'log' })
    attachAt(s, signal(1), 1)
    expect(sampleSlot(s, {})).toBeCloseTo(1000)
    const t = dial(100, { min: 10, max: 1000, scale: 'log' })
    attachAt(t, signal(-1), 1)
    expect(sampleSlot(t, {})).toBeCloseTo(10)
  })

  it('falls back to value space (unclamped) without range metadata', () => {
    const s = dial(7)
    attachAt(s, signal(2), 0.5)
    expect(sampleSlot(s, {})).toBeCloseTo(8)
    const t = dial(7)
    attachAt(t, signal(100), 1)
    expect(sampleSlot(t, {})).toBe(107) // no clamp
  })

  it('a zero depth leaves the base untouched', () => {
    const s = dial(0.5, { min: 0, max: 1 })
    attachAt(s, signal(1), 0)
    expect(sampleSlot(s, {})).toBe(0.5)
  })

  it('replaces (not combines) for non-numeric outputs', () => {
    const s = typedDial<string>('str', 'base')
    attach(s, instantiate(strSrc))
    expect(sampleSlot(s, {})).toBe('from-source')
  })

  describe('mode', () => {
    it("'up' with a bipolar source pushes only above the base", () => {
      // u = (raw+1)/2. raw +1 → u 1 → full swing up; base 0.5, depth
      // 0.2, room up 0.5 → swing 0.2 → pos 0.7.
      const up = dial(0.5, { min: 0, max: 1 })
      attachAt(up, signal(1), 0.2, 'up')
      expect(sampleSlot(up, {})).toBeCloseTo(0.7)
      // raw −1 → u 0 → base unchanged.
      const flat = dial(0.5, { min: 0, max: 1 })
      attachAt(flat, signal(-1), 0.2, 'up')
      expect(sampleSlot(flat, {})).toBeCloseTo(0.5)
    })

    it("'up' scales the swing into the room remaining above", () => {
      // base 0.9, depth 0.25: only 0.1 room up. raw +1 → u 1 → swing
      // min(0.25, 0.1) = 0.1 → pos 1.0.
      const s = dial(0.9, { min: 0, max: 1 })
      attachAt(s, signal(1), 0.25, 'up')
      expect(sampleSlot(s, {})).toBe(1)
    })

    it("'down' with a bipolar source pushes only below the base", () => {
      // raw +1 → u 1 → full swing down; base 0.5, depth 0.2 → pos 0.3.
      const down = dial(0.5, { min: 0, max: 1 })
      attachAt(down, signal(1), 0.2, 'down')
      expect(sampleSlot(down, {})).toBeCloseTo(0.3)
      // raw −1 → u 0 → base unchanged.
      const flat = dial(0.5, { min: 0, max: 1 })
      attachAt(flat, signal(-1), 0.2, 'down')
      expect(sampleSlot(flat, {})).toBeCloseTo(0.5)
    })

    it("'center' with a unipolar source normalizes to bipolar b", () => {
      // b = 2·raw − 1. raw 0 → b −1 → full swing down; raw 1 → b +1 →
      // full swing up; raw 0.5 → b 0 → base. base 0.5, depth 0.3.
      const lo = dial(0.5, { min: 0, max: 1 })
      attachAt(lo, uniSignal(0), 0.3, 'center')
      expect(sampleSlot(lo, {})).toBeCloseTo(0.2)
      const hi = dial(0.5, { min: 0, max: 1 })
      attachAt(hi, uniSignal(1), 0.3, 'center')
      expect(sampleSlot(hi, {})).toBeCloseTo(0.8)
      const mid = dial(0.5, { min: 0, max: 1 })
      attachAt(mid, uniSignal(0.5), 0.3, 'center')
      expect(sampleSlot(mid, {})).toBeCloseTo(0.5)
    })

    it("value-space fallback: 'up' adds depth·u, 'down' subtracts", () => {
      // No range metadata. bipolar source: u = (raw+1)/2.
      const up = dial(7)
      attachAt(up, signal(1), 0.5, 'up') // u 1 → 7 + 0.5
      expect(sampleSlot(up, {})).toBeCloseTo(7.5)
      const down = dial(7)
      attachAt(down, signal(1), 0.5, 'down') // u 1 → 7 − 0.5
      expect(sampleSlot(down, {})).toBeCloseTo(6.5)
      const flat = dial(7)
      attachAt(flat, signal(-1), 0.5, 'up') // u 0 → 7
      expect(sampleSlot(flat, {})).toBeCloseTo(7)
    })
  })
})

describe('nested modulation', () => {
  it('resolves a depth-2 chain', () => {
    // outer.x ← passThrough → inner.x ← 5. Sub-slots have no range
    // metadata, so at depth 1 each layer is base(0) + 1·signal.
    const outer = instantiate(passThrough)
    const inner = instantiate(passThrough)
    inner.params.x.dial.value = 5
    attachAt(outer.params.x, inner, 1)
    expect(sampleSlot(outer.params.x, {})).toBe(5)
  })

  it('resolves a depth-5 chain', () => {
    // dial 9 wrapped 5 levels deep through passThrough at depth 1
    const layers = [
      instantiate(passThrough),
      instantiate(passThrough),
      instantiate(passThrough),
      instantiate(passThrough),
      instantiate(passThrough),
    ]
    layers[4]!.params.x.dial.value = 9
    for (let i = 0; i < 4; i++) attachAt(layers[i]!.params.x, layers[i + 1]!, 1)
    expect(sampleSlot(layers[0]!.params.x, {})).toBe(9)
  })

  it('mutation at the deepest leaf propagates upward', () => {
    const a = instantiate(passThrough)
    const b = instantiate(passThrough)
    attachAt(a.params.x, b, 1)
    b.params.x.dial.value = 1
    expect(sampleSlot(a.params.x, {})).toBe(1)
    b.params.x.dial.value = 2
    expect(sampleSlot(a.params.x, {})).toBe(2)
  })

  it('sub-slot params combine with their own base value', () => {
    // The modulated sub-slot's dial stays live: base 10 + 0.5·4 = 12.
    const outer = instantiate(passThrough)
    outer.params.x.dial.value = 10
    attachAt(outer.params.x, signal(4), 0.5)
    expect(sampleSlot(outer.params.x, {})).toBeCloseTo(12)
  })
})

describe('sampleSlot()', () => {
  it('returns dial value when no source is attached', () => {
    expect(sampleSlot(dial(7), {})).toBe(7)
  })

  it('returns the combined output when a source is attached', () => {
    const s = dial(7)
    attachAt(s, signal(99), 1)
    expect(sampleSlot(s, {})).toBe(106)
  })
})

describe('meta.lerp smoothing', () => {
  it('snaps when lerp is unset', () => {
    const s = dial(0)
    s.dial.value = 10
    expect(sampleSlot(s, { dt: 1 })).toBe(10)
  })

  it('snaps when lerp is 0', () => {
    const s = dial(0, { lerp: 0 })
    s.dial.value = 10
    expect(sampleSlot(s, { dt: 1 })).toBe(10)
  })

  it('first sample seeds to the target (no ease from zero)', () => {
    const s = dial(5, { lerp: 0.1 })
    expect(sampleSlot(s, { dt: 1 / 60 })).toBe(5)
  })

  it('eases toward a moved target over subsequent samples', () => {
    const s = dial(0, { lerp: 0.5 })
    expect(sampleSlot(s, { dt: 0.1 })).toBe(0) // seed
    s.dial.value = 1
    const a = sampleSlot(s, { dt: 0.1 })
    const b = sampleSlot(s, { dt: 0.1 })
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(1)
    expect(b).toBeGreaterThan(a) // monotonic approach
    expect(b).toBeLessThan(1)
  })

  it('converges to the target as time accumulates', () => {
    const s = dial(0, { lerp: 0.1 })
    sampleSlot(s, { dt: 0.1 }) // seed at 0
    s.dial.value = 100
    for (let i = 0; i < 200; i++) sampleSlot(s, { dt: 0.1 })
    expect(sampleSlot(s, { dt: 0.1 })).toBeCloseTo(100, 5)
  })

  it('matches the one-pole step exactly for a known dt/tau', () => {
    const s = dial(0, { lerp: 1 })
    sampleSlot(s, { dt: 1 }) // seed at 0
    s.dial.value = 10
    const alpha = 1 - Math.exp(-1 / 1)
    expect(sampleSlot(s, { dt: 1 })).toBeCloseTo(10 * alpha, 12)
  })

  it('defaults dt to 1/60 when ctx has none', () => {
    const s = dial(0, { lerp: 1 })
    sampleSlot(s, {}) // seed
    s.dial.value = 1
    const alpha = 1 - Math.exp(-(1 / 60) / 1)
    expect(sampleSlot(s, {})).toBeCloseTo(alpha, 12)
  })

  it('does not smooth non-numeric dials', () => {
    const s = typedDial<string>('str', 'a', { lerp: 0.5 })
    s.dial.value = 'b'
    expect(sampleSlot(s, { dt: 1 })).toBe('b')
  })

  it('applies to the base while a source is attached — modulation adds after', () => {
    const s = dial(0, { lerp: 1 })
    sampleSlot(s, { dt: 1 }) // seed at 0
    attachAt(s, signal(1), 0.5)
    // Target unchanged → base stays 0; out = 0 + 0.5·1.
    expect(sampleSlot(s, { dt: 1 })).toBeCloseTo(0.5)
    s.dial.value = 10
    const alpha = 1 - Math.exp(-1 / 1)
    // Smoothed base eases toward 10; modulation rides on top.
    expect(sampleSlot(s, { dt: 1 })).toBeCloseTo(10 * alpha + 0.5, 12)
  })
})

describe('lastSample stash', () => {
  it('is absent before the first sample', () => {
    expect(dial(7).lastSample).toBeUndefined()
  })

  it('records the dial value when no source is attached', () => {
    const s = dial(7)
    sampleSlot(s, {})
    expect(s.lastSample).toBe(7)
  })

  it('records the combined output (not the bare dial value) when attached', () => {
    const s = dial(7)
    attachAt(s, signal(99), 1)
    sampleSlot(s, {})
    expect(s.lastSample).toBe(106)
    expect(s.dial.value).toBe(7)
  })

  it('stashes on nested param slots too', () => {
    const s = dial(0)
    const src = signal(5)
    attachAt(s, src, 1)
    sampleSlot(s, {})
    expect(src.params.x.lastSample).toBe(5)
  })

  it('tracks the resolved value across re-samples', () => {
    const s = dial(1)
    sampleSlot(s, {})
    s.dial.value = 2
    sampleSlot(s, {})
    expect(s.lastSample).toBe(2)
  })
})

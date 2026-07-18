import { describe, expect, it } from 'vitest'
import {
  attach,
  defineSource,
  dial,
  instantiate,
  read,
  sampleSlot,
  typedDial,
} from '../src'

const passThrough = defineSource({
  name: 'test.passThrough',
  outType: 'number',
  params: { x: { type: 'number', slot: () => dial(0) } },
  body: ({ x }) => x,
})

const fromCtx = defineSource({
  name: 'test.fromCtx',
  outType: 'number',
  params: {},
  body: (_, ctx) => (ctx.t as number) ?? -1,
})

describe('read()', () => {
  it('returns a record with one entry per slot', () => {
    const params = { a: dial(1), b: dial(2) }
    expect(read(params, {})).toEqual({ a: 1, b: 2 })
  })

  it('passes ctx through to sources', () => {
    const params = { now: dial(0) }
    attach(params.now, instantiate(fromCtx))
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
    const src = instantiate(passThrough)
    src.params.x.dial.value = 100
    attach(params.v, src)
    expect(read(params, {}).v).toBe(100)
    params.v.attached = null
    expect(read(params, {}).v).toBe(7)
  })
})

describe('nested modulation', () => {
  it('resolves a depth-2 chain', () => {
    // outer.x  ← passThrough → inner.x ← 5
    const outer = instantiate(passThrough)
    const inner = instantiate(passThrough)
    inner.params.x.dial.value = 5
    attach(outer.params.x, inner)
    expect(sampleSlot(outer.params.x, {})).toBe(5)
  })

  it('resolves a depth-5 chain', () => {
    // dial 9 wrapped 5 levels deep through passThrough
    const layers = [
      instantiate(passThrough),
      instantiate(passThrough),
      instantiate(passThrough),
      instantiate(passThrough),
      instantiate(passThrough),
    ]
    layers[4]!.params.x.dial.value = 9
    for (let i = 0; i < 4; i++) attach(layers[i]!.params.x, layers[i + 1]!)
    expect(sampleSlot(layers[0]!.params.x, {})).toBe(9)
  })

  it('mutation at the deepest leaf propagates upward', () => {
    const a = instantiate(passThrough)
    const b = instantiate(passThrough)
    attach(a.params.x, b)
    b.params.x.dial.value = 1
    expect(sampleSlot(a.params.x, {})).toBe(1)
    b.params.x.dial.value = 2
    expect(sampleSlot(a.params.x, {})).toBe(2)
  })
})

describe('sampleSlot()', () => {
  it('returns dial value when no source is attached', () => {
    expect(sampleSlot(dial(7), {})).toBe(7)
  })

  it('returns source output when one is attached', () => {
    const s = dial(7)
    const src = instantiate(passThrough)
    src.params.x.dial.value = 99
    attach(s, src)
    expect(sampleSlot(s, {})).toBe(99)
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
})

import { afterEach, describe, expect, it } from 'vitest'
import {
  attach,
  defineSource,
  dial,
  fromJSON,
  instantiate,
  read,
  registerSource,
  registerStdlib,
  toJSON,
  sine,
  clearRegistry,
} from '../src'

// Stdlib is needed for the round-trip tests that use sine by name.
afterEach(() => {
  clearRegistry()
  registerStdlib()
})

describe('toJSON()', () => {
  it('snapshots a bare dials object', () => {
    const d = { a: dial(1), b: dial(2, { min: 0, max: 10 }) }
    expect(toJSON(d)).toEqual({
      a: { value: 1 },
      b: { value: 2 },
    })
  })

  it('snapshots an attached source with its sub-slot values', () => {
    const d = { freq: dial(600) }
    const src = instantiate(sine)
    src.params.lo.dial.value = 500
    src.params.hi.dial.value = 700
    src.params.freq.dial.value = 0.3
    src.params.phase.dial.value = 0
    attach(d.freq, src)
    expect(toJSON(d)).toEqual({
      freq: {
        value: 600,
        attached: {
          name: 'sine',
          params: {
            lo: { value: 500 },
            hi: { value: 700 },
            freq: { value: 0.3 },
            phase: { value: 0 },
          },
        },
      },
    })
  })

  it('snapshots nested modulation (depth-2)', () => {
    const d = { freq: dial(600) }
    const outer = instantiate(sine)
    const inner = instantiate(sine)
    attach(d.freq, outer)
    attach(outer.params.hi, inner)
    const snap = toJSON(d)
    expect(snap.freq?.attached?.name).toBe('sine')
    expect(snap.freq?.attached?.params.hi?.attached?.name).toBe('sine')
  })
})

describe('fromJSON()', () => {
  it('round-trips a bare dials object', () => {
    const d = { a: dial(0), b: dial(0) }
    fromJSON(d, { a: { value: 5 }, b: { value: 10 } })
    expect(read(d, {})).toEqual({ a: 5, b: 10 })
  })

  it('round-trips an attached source', () => {
    const d = { freq: dial(600) }
    const src = instantiate(sine)
    src.params.lo.dial.value = 550
    src.params.hi.dial.value = 650
    attach(d.freq, src)
    const snap = toJSON(d)

    // hydrate a fresh copy
    const fresh = { freq: dial(600) }
    fromJSON(fresh, snap)
    expect(fresh.freq.attached).not.toBeNull()
    expect(fresh.freq.attached!.def.name).toBe('sine')
    expect(fresh.freq.attached!.params.lo.dial.value).toBe(550)
    expect(fresh.freq.attached!.params.hi.dial.value).toBe(650)
  })

  it('detaches when the snapshot has no attached field', () => {
    const d = { freq: dial(600) }
    attach(d.freq, instantiate(sine))
    fromJSON(d, { freq: { value: 600 } })
    expect(d.freq.attached).toBeNull()
  })

  it('throws on snapshot referencing an unregistered source', () => {
    clearRegistry() // wipe stdlib for this test
    const d = { freq: dial(0) }
    expect(() =>
      fromJSON(d, {
        freq: { value: 0, attached: { name: 'sine', params: {} } },
      }),
    ).toThrow(/sine/)
  })

  it('leaves missing snapshot keys at their default', () => {
    const d = { a: dial(7), b: dial(8) }
    fromJSON(d, { a: { value: 1 } })
    expect(read(d, {})).toEqual({ a: 1, b: 8 })
  })

  it('ignores extra snapshot keys (forward-compat)', () => {
    const d = { a: dial(0) }
    fromJSON(d, { a: { value: 5 }, futureKey: { value: 99 } })
    expect(read(d, {})).toEqual({ a: 5 })
  })

  it('survives JSON.stringify / JSON.parse', () => {
    const d = { freq: dial(600) }
    const src = instantiate(sine)
    src.params.hi.dial.value = 633
    attach(d.freq, src)
    const wireFormat = JSON.parse(JSON.stringify(toJSON(d)))
    const fresh = { freq: dial(0) }
    fromJSON(fresh, wireFormat)
    expect(fresh.freq.attached!.params.hi.dial.value).toBe(633)
  })
})

describe('custom registered source', () => {
  it('round-trips when registered', () => {
    const custom = defineSource({
      name: 'test.custom',
      outType: 'number',
      params: { v: { type: 'number', slot: () => dial(0) } },
      body: ({ v }) => v,
    })
    registerSource(custom)
    const d = { x: dial(0) }
    attach(d.x, instantiate(custom))
    d.x.attached!.params.v.dial.value = 13
    const snap = toJSON(d)
    const fresh = { x: dial(0) }
    fromJSON(fresh, snap)
    expect(fresh.x.attached!.params.v.dial.value).toBe(13)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import {
  attach,
  DEFAULT_DEPTH,
  defineSource,
  dial,
  fromJSON,
  instantiate,
  read,
  registerSource,
  registerStdlib,
  setDepth,
  setGlide,
  setMode,
  toJSON,
  sine,
  clearRegistry,
  type DialsSnap,
} from '../src'

// Stdlib is needed for the round-trip tests that use sine by name.
afterEach(() => {
  clearRegistry()
  registerStdlib()
})

describe('toJSON()', () => {
  it('snapshots a bare dials object with its slot-level depth, mode, and glide', () => {
    const d = { a: dial(1), b: dial(2, { min: 0, max: 10 }) }
    expect(toJSON(d)).toEqual({
      a: { value: 1, depth: 0, mode: 'center', glide: 0 },
      b: { value: 2, depth: 0, mode: 'center', glide: 0 },
    })
  })

  it('snapshots depth, mode, and glide for an armed-but-unattached slot', () => {
    const d = { freq: dial(600) }
    setDepth(d.freq, 0.3)
    setMode(d.freq, 'up')
    setGlide(d.freq, 1.5)
    expect(toJSON(d).freq).toEqual({ value: 600, depth: 0.3, mode: 'up', glide: 1.5 })
  })

  it('snapshots an attached source with slot depth/mode and sub-slot values', () => {
    const d = { freq: dial(600) }
    const src = instantiate(sine)
    src.params.freq.dial.value = 0.3
    src.params.phase.dial.value = 0
    attach(d.freq, src)
    setDepth(d.freq, 0.4)
    expect(toJSON(d)).toEqual({
      freq: {
        value: 600,
        depth: 0.4,
        mode: 'center',
        glide: 0,
        attached: {
          name: 'sine',
          params: {
            freq: { value: 0.3, depth: 0, mode: 'center', glide: 0 },
            phase: { value: 0, depth: 0, mode: 'center', glide: 0 },
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
    attach(outer.params.freq, inner)
    setDepth(outer.params.freq, 0.2)
    const snap = toJSON(d)
    expect(snap.freq?.attached?.name).toBe('sine')
    // A bare attach seeds DEFAULT_DEPTH onto the host slot.
    expect(snap.freq?.depth).toBe(DEFAULT_DEPTH)
    expect(snap.freq?.attached?.params.freq?.attached?.name).toBe('sine')
    expect(snap.freq?.attached?.params.freq?.depth).toBe(0.2)
  })
})

describe('fromJSON()', () => {
  it('round-trips a bare dials object', () => {
    const d = { a: dial(0), b: dial(0) }
    fromJSON(d, { a: { value: 5 }, b: { value: 10 } })
    expect(read(d, {})).toEqual({ a: 5, b: 10 })
  })

  it('round-trips an attached source with its slot-level depth', () => {
    const d = { freq: dial(600) }
    const src = instantiate(sine)
    src.params.freq.dial.value = 0.5
    src.params.phase.dial.value = 1.5
    attach(d.freq, src)
    setDepth(d.freq, 0.35)
    const snap = toJSON(d)

    // hydrate a fresh copy
    const fresh = { freq: dial(600) }
    fromJSON(fresh, snap)
    expect(fresh.freq.attached).not.toBeNull()
    expect(fresh.freq.attached!.def.name).toBe('sine')
    expect(fresh.freq.modDepth).toBe(0.35)
    expect(fresh.freq.attached!.params.freq.dial.value).toBe(0.5)
    expect(fresh.freq.attached!.params.phase.dial.value).toBe(1.5)
  })

  it('round-trips depth with nothing attached', () => {
    const d = { freq: dial(600) }
    setDepth(d.freq, 0.42)
    const snap = toJSON(d)
    const fresh = { freq: dial(600) }
    fromJSON(fresh, snap)
    expect(fresh.freq.attached).toBeNull()
    expect(fresh.freq.modDepth).toBe(0.42)
  })

  it('preserves an explicit snapshot depth of 0 even with a source attached', () => {
    // The attach-time seeding must NOT clobber a snapshot's explicit 0 —
    // depth is applied after the attach on load.
    const snap = {
      freq: {
        value: 600,
        depth: 0,
        attached: { name: 'sine', params: {} },
      },
    } as unknown as DialsSnap
    const d = { freq: dial(600) }
    fromJSON(d, snap)
    expect(d.freq.attached).not.toBeNull()
    expect(d.freq.modDepth).toBe(0)
  })

  it('round-trips the slot-level modulation mode', () => {
    const d = { freq: dial(600) }
    const src = instantiate(sine)
    attach(d.freq, src)
    setMode(d.freq, 'down')
    setDepth(d.freq, 0.3)
    const snap = toJSON(d)
    expect(snap.freq?.mode).toBe('down')

    const fresh = { freq: dial(600) }
    fromJSON(fresh, snap)
    expect(fresh.freq.modMode).toBe('down')
  })

  it('round-trips mode for an armed-but-unattached slot', () => {
    const d = { freq: dial(600) }
    setMode(d.freq, 'up')
    setDepth(d.freq, 0.5)
    const snap = toJSON(d)
    const fresh = { freq: dial(600) }
    fromJSON(fresh, snap)
    expect(fresh.freq.attached).toBeNull()
    expect(fresh.freq.modMode).toBe('up')
    expect(fresh.freq.modDepth).toBe(0.5)
  })

  it("leaves the slot's default mode when the snapshot has none", () => {
    // A pre-mode snapshot (older wire format) leaves the slot's own
    // 'center' default.
    const legacy = {
      freq: {
        value: 600,
        attached: { name: 'sine', params: {} },
      },
    } as unknown as DialsSnap
    const d = { freq: dial(600) }
    fromJSON(d, legacy)
    expect(d.freq.modMode).toBe('center')
  })

  it('seeds DEFAULT_DEPTH when the snapshot has no depth', () => {
    // A pre-depth snapshot (older wire format) hydrates at the default
    // via the attach-time seeding, since depth is absent on the snap.
    const legacy = {
      freq: {
        value: 600,
        attached: { name: 'sine', params: {} },
      },
    } as unknown as DialsSnap
    const d = { freq: dial(600) }
    fromJSON(d, legacy)
    expect(d.freq.modDepth).toBe(DEFAULT_DEPTH)
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
      } as unknown as DialsSnap),
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
    src.params.freq.dial.value = 6.33
    attach(d.freq, src)
    setDepth(d.freq, 0.6)
    const wireFormat = JSON.parse(JSON.stringify(toJSON(d)))
    const fresh = { freq: dial(0) }
    fromJSON(fresh, wireFormat)
    expect(fresh.freq.attached!.params.freq.dial.value).toBe(6.33)
    expect(fresh.freq.modDepth).toBe(0.6)
  })

  it('round-trips glide — slot state like depth/mode', () => {
    const d = { freq: dial(600) }
    setGlide(d.freq, 2.5)
    const fresh = { freq: dial(0) }
    fromJSON(fresh, JSON.parse(JSON.stringify(toJSON(d))))
    expect(fresh.freq.glide).toBe(2.5)
  })

  it("leaves the slot's glide when the snapshot has none", () => {
    const d = { freq: dial(600) }
    setGlide(d.freq, 1)
    fromJSON(d, { freq: { value: 5 } })
    expect(d.freq.glide).toBe(1)
  })

  it('drops a snapshot attachment onto a non-modulatable slot', () => {
    // The code owns the meta: if it says the slot doesn't modulate, a
    // snapshot written under an older meta can't re-arm it. Value and
    // slot-level state still hydrate.
    const snap = {
      freq: {
        value: 42,
        depth: 0.5,
        glide: 1.5,
        attached: { name: 'sine', params: {} },
      },
    } as unknown as DialsSnap
    const d = { freq: dial(600, { modulatable: false }) }
    fromJSON(d, snap)
    expect(d.freq.attached).toBeNull()
    expect(d.freq.dial.value).toBe(42)
    expect(d.freq.modDepth).toBe(0.5)
    expect(d.freq.glide).toBe(1.5)
  })
})

describe('custom registered source', () => {
  it('round-trips when registered', () => {
    const custom = defineSource({
      name: 'test.custom',
      outType: 'number',
      polarity: 'bipolar',
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

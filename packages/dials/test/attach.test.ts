import { describe, expect, it } from 'vitest'
import {
  attach,
  attachFrom,
  DEFAULT_DEPTH,
  defineSource,
  detach,
  dial,
  instantiate,
  sampleSlot,
  setDepth,
  setMode,
  typedDial,
} from '../src'

const k1 = defineSource({
  name: 'test.k1',
  outType: 'number',
  polarity: 'bipolar',
  params: {},
  body: () => 1,
})

const uni = defineSource({
  name: 'test.uni',
  outType: 'number',
  polarity: 'unipolar',
  params: {},
  body: () => 1,
})

const rgbBlack = defineSource({
  name: 'test.rgbBlack',
  outType: 'rgb',
  polarity: 'bipolar',
  params: {},
  body: () => [0, 0, 0] as [number, number, number],
})

describe('attach()', () => {
  it('stores the bare source on the slot', () => {
    const s = dial(7)
    const src = instantiate(k1)
    attach(s, src)
    expect(s.attached).toBe(src)
  })

  it('leaves modMode alone (attaching a unipolar source does not flip it)', () => {
    const s = dial(7)
    expect(s.modMode).toBe('center')
    attach(s, instantiate(uni))
    expect(s.modMode).toBe('center')
  })

  it('seeds modDepth to DEFAULT_DEPTH when the slot depth is 0', () => {
    const s = dial(7)
    expect(s.modDepth).toBe(0)
    attach(s, instantiate(k1))
    expect(s.modDepth).toBe(DEFAULT_DEPTH)
  })

  it('respects a pre-set modDepth (does not re-seed)', () => {
    const s = dial(7)
    setDepth(s, 0.4)
    attach(s, instantiate(k1))
    expect(s.modDepth).toBe(0.4)
  })

  it('modulates the slot additively around the dial value', () => {
    // No range metadata → value-space combine: base + modDepth·signal.
    const s = dial(7)
    expect(sampleSlot(s, {})).toBe(7)
    attach(s, instantiate(k1))
    setDepth(s, 0.5)
    expect(sampleSlot(s, {})).toBeCloseTo(7.5)
  })

  it('throws on outType mismatch', () => {
    const s = dial(0) // 'number'
    expect(() => attach(s, instantiate(rgbBlack) as never)).toThrow(/outType|number|rgb/i)
  })

  it('returns the slot for chaining', () => {
    const s = dial(0)
    expect(attach(s, instantiate(k1))).toBe(s)
  })
})

describe('attachFrom()', () => {
  it('instantiates + attaches in one call, returning the source', () => {
    const s = dial(7)
    const src = attachFrom(s, k1)
    expect(s.attached).toBe(src)
    expect(s.modDepth).toBe(DEFAULT_DEPTH)
  })

  it('respects a pre-set modDepth (does not re-seed)', () => {
    const s = dial(7)
    setDepth(s, 0.25)
    attachFrom(s, k1)
    expect(s.modDepth).toBe(0.25)
  })

  it('throws on outType mismatch before instantiating', () => {
    const s = dial(0)
    expect(() => attachFrom(s, rgbBlack as never)).toThrow()
  })
})

describe('setDepth()', () => {
  it('writes the depth onto the slot', () => {
    const s = dial(0)
    attachFrom(s, k1)
    setDepth(s, 0.7)
    expect(s.modDepth).toBe(0.7)
  })

  it('clamps into [0, 1]', () => {
    const s = dial(0)
    attachFrom(s, k1)
    setDepth(s, -3)
    expect(s.modDepth).toBe(0)
    setDepth(s, 42)
    expect(s.modDepth).toBe(1)
  })

  it('works with nothing attached (arms the envelope ahead of a source)', () => {
    const s = dial(0)
    setDepth(s, 0.5)
    expect(s.attached).toBeNull()
    expect(s.modDepth).toBe(0.5)
  })

  it('survives detach then reattach', () => {
    const s = dial(0)
    attachFrom(s, k1)
    setDepth(s, 0.6)
    detach(s)
    expect(s.modDepth).toBe(0.6)
    attachFrom(s, k1)
    // Reattach must not re-seed over the surviving width.
    expect(s.modDepth).toBe(0.6)
  })
})

describe('mode', () => {
  it("defaults to 'center'", () => {
    expect(dial(0).modMode).toBe('center')
  })

  it('is untouched by attaching any source (unipolar included)', () => {
    const s = dial(0)
    attach(s, instantiate(uni))
    expect(s.modMode).toBe('center')
    const t = dial(0)
    attachFrom(t, uni)
    expect(t.modMode).toBe('center')
  })

  it('setMode writes the mode onto the slot', () => {
    const s = dial(0)
    attachFrom(s, k1)
    setMode(s, 'down')
    expect(s.modMode).toBe('down')
  })

  it('setMode works with nothing attached (arms the shape ahead of a source)', () => {
    const s = dial(0)
    setMode(s, 'up')
    expect(s.attached).toBeNull()
    expect(s.modMode).toBe('up')
  })

  it('survives detach then reattach', () => {
    const s = dial(0)
    setMode(s, 'down')
    setDepth(s, 0.6)
    attachFrom(s, k1)
    detach(s)
    expect(s.modMode).toBe('down')
    expect(s.modDepth).toBe(0.6)
    attachFrom(s, k1)
    expect(s.modMode).toBe('down')
    expect(s.modDepth).toBe(0.6)
  })
})

describe('detach()', () => {
  it('drops the attachment and reveals the unmodulated dial value', () => {
    const s = dial(7)
    attach(s, instantiate(k1))
    setDepth(s, 0.5)
    expect(sampleSlot(s, {})).toBeCloseTo(7.5)
    detach(s)
    expect(s.attached).toBeNull()
    expect(sampleSlot(s, {})).toBe(7)
  })

  it('preserves the dial value across attach/detach cycles', () => {
    const s = dial(7)
    s.dial.value = 99
    attach(s, instantiate(k1))
    detach(s)
    expect(s.dial.value).toBe(99)
  })

  it('is a no-op on a slot with no source', () => {
    const s = dial(5)
    detach(s)
    expect(s.dial.value).toBe(5)
    expect(s.attached).toBeNull()
  })
})

describe('typed dial attach', () => {
  it('accepts a source whose outType matches (non-numeric → replace)', () => {
    const s = typedDial<[number, number, number]>('rgb', [1, 1, 1])
    attach(s, instantiate(rgbBlack))
    expect(sampleSlot(s, {})).toEqual([0, 0, 0])
  })
})

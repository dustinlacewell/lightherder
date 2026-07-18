import { describe, expect, it } from 'vitest'
import {
  attach,
  attachFrom,
  defineSource,
  detach,
  dial,
  instantiate,
  sampleSlot,
  typedDial,
} from '../src'

const k42 = defineSource({
  name: 'test.k42',
  outType: 'number',
  params: {},
  body: () => 42,
})

const rgbBlack = defineSource({
  name: 'test.rgbBlack',
  outType: 'rgb',
  params: {},
  body: () => [0, 0, 0] as [number, number, number],
})

describe('attach()', () => {
  it('drives the slot via the attached source', () => {
    const s = dial(7)
    expect(sampleSlot(s, {})).toBe(7)
    attach(s, instantiate(k42))
    expect(sampleSlot(s, {})).toBe(42)
  })

  it('throws on outType mismatch', () => {
    const s = dial(0) // 'number'
    expect(() => attach(s, instantiate(rgbBlack) as never)).toThrow(/outType|number|rgb/i)
  })

  it('returns the slot for chaining', () => {
    const s = dial(0)
    expect(attach(s, instantiate(k42))).toBe(s)
  })
})

describe('attachFrom()', () => {
  it('instantiates + attaches in one call', () => {
    const s = dial(7)
    const src = attachFrom(s, k42)
    expect(s.attached).toBe(src)
    expect(sampleSlot(s, {})).toBe(42)
  })

  it('throws on outType mismatch before instantiating', () => {
    const s = dial(0)
    expect(() => attachFrom(s, rgbBlack as never)).toThrow()
  })
})

describe('detach()', () => {
  it('drops the source and reveals the underlying dial value', () => {
    const s = dial(7)
    attach(s, instantiate(k42))
    expect(sampleSlot(s, {})).toBe(42)
    detach(s)
    expect(s.attached).toBeNull()
    expect(sampleSlot(s, {})).toBe(7)
  })

  it('preserves the dial value across attach/detach cycles', () => {
    const s = dial(7)
    s.dial.value = 99
    attach(s, instantiate(k42))
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
  it('accepts a source whose outType matches', () => {
    const s = typedDial<[number, number, number]>('rgb', [1, 1, 1])
    attach(s, instantiate(rgbBlack))
    expect(sampleSlot(s, {})).toEqual([0, 0, 0])
  })
})

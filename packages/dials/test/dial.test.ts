import { describe, expect, it } from 'vitest'
import { attachFrom, cloneSlot, dial, rebaseSlot, setDial, sine, typedDial } from '../src'

describe('dial()', () => {
  it('creates a numeric slot with type tag "number"', () => {
    const s = dial(0.5)
    expect(s.kind).toBe('slot')
    expect(s.outType).toBe('number')
    expect(s.dial.kind).toBe('dial')
    expect(s.dial.value).toBe(0.5)
    expect(s.attached).toBeNull()
  })

  it('carries metadata verbatim', () => {
    const s = dial(2, { min: 0, max: 10, step: 0.5, label: 'two' })
    expect(s.dial.meta).toEqual({ min: 0, max: 10, step: 0.5, label: 'two' })
  })

  it('omits meta defaults to an empty object', () => {
    const s = dial(0)
    expect(s.dial.meta).toEqual({})
  })
})

describe('typedDial()', () => {
  it('tags the slot with the caller-supplied type', () => {
    const s = typedDial<[number, number, number]>('rgb', [1, 0, 0])
    expect(s.outType).toBe('rgb')
    expect(s.dial.value).toEqual([1, 0, 0])
  })
})

describe('setDial()', () => {
  it('writes through to dial.value', () => {
    const s = dial(0)
    setDial(s, 0.7)
    expect(s.dial.value).toBe(0.7)
  })

  it('clamps numbers when min/max are both defined', () => {
    const s = dial(0, { min: 0, max: 1 })
    setDial(s, -5)
    expect(s.dial.value).toBe(0)
    setDial(s, 5)
    expect(s.dial.value).toBe(1)
  })

  it('does not clamp when only min is defined', () => {
    const s = dial(0, { min: 0 })
    setDial(s, -5)
    expect(s.dial.value).toBe(-5)
  })

  it('does not clamp non-number values', () => {
    const s = typedDial<string>('text', 'hi')
    setDial(s, 'bye')
    expect(s.dial.value).toBe('bye')
  })
})

describe('rebaseSlot()', () => {
  it('makes the current value the reset target', () => {
    const s = dial(3, { min: 0, max: 10 })
    setDial(s, 7)
    expect(s.dial.initial).toBe(3)
    rebaseSlot(s)
    expect(s.dial.initial).toBe(7)
  })

  it('recurses through an attached source\'s sub-slots', () => {
    const s = dial(0, { min: -1, max: 1 })
    const src = attachFrom(s, sine)
    src.params.freq.dial.value = 4.2
    rebaseSlot(s)
    expect(src.params.freq.dial.initial).toBe(4.2)
  })

  it('survives cloning — a clone of a rebased slot keeps the new home', () => {
    const s = dial(3, { min: 0, max: 10 })
    setDial(s, 7)
    rebaseSlot(s)
    expect(cloneSlot(s).dial.initial).toBe(7)
  })
})

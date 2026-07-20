import { describe, expect, it } from 'vitest'
import {
  attachFrom,
  dial,
  cloneSlot,
  sampleSlot,
  setDepth,
  setGlide,
  setMode,
  sine,
} from '../src'

describe('cloneSlot()', () => {
  it('copies the tunable slot state: value, depth, mode, glide', () => {
    const s = dial(3, { min: 0, max: 10 })
    setDepth(s, 0.4)
    setMode(s, 'up')
    setGlide(s, 1.5)
    const c = cloneSlot(s)
    expect(c.dial.value).toBe(3)
    expect(c.modDepth).toBe(0.4)
    expect(c.modMode).toBe('up')
    expect(c.glide).toBe(1.5)
  })

  it('shares meta by reference — safe because ALL user state lives on the slot', () => {
    const s = dial(3, { min: 0, max: 10 })
    const c = cloneSlot(s)
    expect(c.dial.meta).toBe(s.dial.meta)
    // Editing the clone's slot state must not leak to the original
    // through the shared meta (the regression that motivated moving
    // glide off DialMeta and onto the Slot).
    setGlide(c, 2)
    setDepth(c, 0.9)
    expect(s.glide).toBe(0)
    expect(s.modDepth).toBe(0)
  })

  it('does not copy sampler scratch (lastSample / _glideY)', () => {
    const s = dial(5)
    setGlide(s, 1)
    sampleSlot(s, { dt: 1 })
    expect(s.lastSample).toBe(5)
    const c = cloneSlot(s)
    expect(c.lastSample).toBeUndefined()
    expect(c._glideY).toBeUndefined()
  })

  it('re-instantiates attached sources so clones never share body state', () => {
    const s = dial(0, { min: -1, max: 1 })
    attachFrom(s, sine)
    const c = cloneSlot(s)
    expect(c.attached).not.toBe(s.attached)
    expect(c.attached!.def).toBe(s.attached!.def)
    // Advance the original's phase; the clone must not feel it.
    for (let i = 0; i < 10; i++) sampleSlot(s, { dt: 0.01 })
    const first = sampleSlot(c, { dt: 0 })
    expect(first).toBeCloseTo(0, 6) // clone's sine still at phase 0
  })

  it('carries sub-slot state through the attached tree', () => {
    const s = dial(0, { min: -1, max: 1 })
    const src = attachFrom(s, sine)
    src.params.freq.dial.value = 4.2
    setGlide(src.params.freq as never, 0.7)
    const c = cloneSlot(s)
    expect(c.attached!.params.freq.dial.value).toBe(4.2)
    expect((c.attached!.params.freq as { glide: number }).glide).toBe(0.7)
  })
})

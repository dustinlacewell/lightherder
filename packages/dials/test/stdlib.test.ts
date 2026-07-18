import { describe, expect, it } from 'vitest'
import {
  add,
  brown,
  clamp,
  fbm,
  gate,
  instantiate,
  lerp,
  mul,
  perlin1D,
  phaseGate,
  ramp,
  remap,
  sampleSource,
  saw,
  sine,
  smooth,
  square,
  tri,
  valueNoise,
  whiteNoise,
} from '../src'

// Tiny helper: build, set params, sample once.
function once<P extends Record<string, unknown>, T>(
  def: Parameters<typeof instantiate>[0],
  paramOverrides: Record<string, number>,
  ctx: Record<string, unknown> = {},
): T {
  const s = instantiate(def)
  for (const [k, v] of Object.entries(paramOverrides)) {
    ;(s.params as Record<string, { dial: { value: number } }>)[k]!.dial.value = v
  }
  return sampleSource(s, ctx) as T
}

describe('sine', () => {
  it('sine: midpoint at t=0 with phase=0', () => {
    // sin(0) = 0 → (0+1)/2 = 0.5 → midpoint of [lo, hi]
    expect(once(sine, { lo: -2, hi: 2, freq: 1, phase: 0 }, { t: 0 })).toBeCloseTo(0)
    expect(once(sine, { lo: 0, hi: 10, freq: 1, phase: 0 }, { t: 0 })).toBeCloseTo(5)
  })

  it('sine: peaks at quarter period', () => {
    // freq = 1 Hz; quarter period = 0.25 s → sin(π/2) = 1 → hi
    const v = once(sine, { lo: -2, hi: 2, freq: 1, phase: 0 }, { t: 0.25 })
    expect(v).toBeCloseTo(2)
  })

  it('sine: troughs at 3/4 period', () => {
    const v = once(sine, { lo: -2, hi: 2, freq: 1, phase: 0 }, { t: 0.75 })
    expect(v).toBeCloseTo(-2)
  })

})

describe('tri', () => {
  it('crosses midpoint (rising) at quarter cycle', () => {
    // p=0.25 → triangle-shape = 0 → midpoint of [lo, hi]
    expect(
      once(tri, { lo: -1, hi: 1, freq: 1, phase: 0 }, { t: 0.25 }),
    ).toBeCloseTo(0)
  })

  it('peaks at hi at half cycle', () => {
    // p=0.5 → triangle-shape = 1 → hi
    expect(
      once(tri, { lo: -2, hi: 2, freq: 1, phase: 0 }, { t: 0.5 }),
    ).toBeCloseTo(2)
  })

  it('starts at lo at t=0', () => {
    // p=0 → triangle-shape = -1 → lo
    expect(
      once(tri, { lo: -1, hi: 1, freq: 1, phase: 0 }, { t: 0 }),
    ).toBeCloseTo(-1)
  })
})

describe('saw', () => {
  it('starts at lo, ends near hi across one period', () => {
    expect(once(saw, { lo: -1, hi: 1, freq: 1, phase: 0 }, { t: 0 })).toBeCloseTo(-1)
    expect(
      once(saw, { lo: -1, hi: 1, freq: 1, phase: 0 }, { t: 0.999999 }),
    ).toBeCloseTo(1, 5)
  })
})

describe('square', () => {
  it('high in first half, low in second (duty=0.5)', () => {
    expect(once(square, { lo: -1, hi: 1, freq: 1, duty: 0.5, phase: 0 }, { t: 0.1 })).toBe(1)
    expect(once(square, { lo: -1, hi: 1, freq: 1, duty: 0.5, phase: 0 }, { t: 0.7 })).toBe(-1)
  })
})

describe('whiteNoise', () => {
  it('produces values inside [lo, hi]', () => {
    const inst = instantiate(whiteNoise)
    inst.params.seed.dial.value = 42
    inst.params.lo.dial.value = -1
    inst.params.hi.dial.value = 1
    for (let i = 0; i < 100; i++) {
      const v = sampleSource(inst, {})
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('two instances with the same seed produce the same sequence', () => {
    const a = instantiate(whiteNoise)
    const b = instantiate(whiteNoise)
    a.params.seed.dial.value = 99
    b.params.seed.dial.value = 99
    for (let i = 0; i < 10; i++) {
      expect(sampleSource(a, {})).toBe(sampleSource(b, {}))
    }
  })

  it('different seeds produce different sequences', () => {
    const a = instantiate(whiteNoise)
    const b = instantiate(whiteNoise)
    a.params.seed.dial.value = 1
    b.params.seed.dial.value = 2
    const seqA = [0, 0, 0].map(() => sampleSource(a, {}))
    const seqB = [0, 0, 0].map(() => sampleSource(b, {}))
    expect(seqA).not.toEqual(seqB)
  })
})

describe('valueNoise', () => {
  it('is deterministic for fixed (seed, t)', () => {
    const a = instantiate(valueNoise)
    const b = instantiate(valueNoise)
    a.params.seed.dial.value = 5
    b.params.seed.dial.value = 5
    expect(sampleSource(a, { t: 0.3 })).toBeCloseTo(sampleSource(b, { t: 0.3 }))
  })

  it('changes smoothly with t (consecutive samples are close)', () => {
    const inst = instantiate(valueNoise)
    inst.params.rate.dial.value = 1
    const v1 = sampleSource(inst, { t: 0.5 })
    const v2 = sampleSource(inst, { t: 0.501 })
    expect(Math.abs(v2 - v1)).toBeLessThan(0.05)
  })
})

describe('ramp', () => {
  it('accumulates rate * dt', () => {
    const r = instantiate(ramp)
    r.params.rate.dial.value = 2
    expect(sampleSource(r, { dt: 0.5 })).toBeCloseTo(1)
    expect(sampleSource(r, { dt: 0.5 })).toBeCloseTo(2)
    expect(sampleSource(r, { dt: 0.5 })).toBeCloseTo(3)
  })

  it('two instances accumulate independently', () => {
    const a = instantiate(ramp)
    const b = instantiate(ramp)
    sampleSource(a, { dt: 1 })
    sampleSource(a, { dt: 1 })
    expect(sampleSource(b, { dt: 1 })).toBeCloseTo(1)
  })
})

describe('smooth', () => {
  it('initializes to first signal value', () => {
    const s = instantiate(smooth)
    s.params.signal.dial.value = 5
    s.params.tau.dial.value = 0.1
    expect(sampleSource(s, { dt: 1 / 60 })).toBe(5)
  })

  it('converges toward signal over time', () => {
    const s = instantiate(smooth)
    s.params.tau.dial.value = 0.01
    s.params.signal.dial.value = 0
    sampleSource(s, { dt: 1 / 60 }) // y = 0
    s.params.signal.dial.value = 1
    let last = 0
    for (let i = 0; i < 100; i++) {
      const v = sampleSource(s, { dt: 1 / 60 })
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
    expect(last).toBeCloseTo(1, 2)
  })
})

describe('add / mul / lerp', () => {
  it('add', () => {
    expect(once(add, { a: 2, b: 3 }, {})).toBe(5)
  })
  it('mul', () => {
    expect(once(mul, { a: 4, b: 5 }, {})).toBe(20)
  })
  it('lerp at endpoints and midpoint', () => {
    expect(once(lerp, { a: 10, b: 20, t: 0 }, {})).toBe(10)
    expect(once(lerp, { a: 10, b: 20, t: 1 }, {})).toBe(20)
    expect(once(lerp, { a: 10, b: 20, t: 0.5 }, {})).toBe(15)
  })
})

describe('clamp', () => {
  it('passes through inside range', () => {
    expect(once(clamp, { signal: 0.5, lo: 0, hi: 1 }, {})).toBe(0.5)
  })
  it('clamps below', () => {
    expect(once(clamp, { signal: -1, lo: 0, hi: 1 }, {})).toBe(0)
  })
  it('clamps above', () => {
    expect(once(clamp, { signal: 99, lo: 0, hi: 1 }, {})).toBe(1)
  })
})

describe('remap', () => {
  it('maps [-1,1] to [0,1]', () => {
    expect(once(remap, { signal: -1, inLo: -1, inHi: 1, outLo: 0, outHi: 1 }, {})).toBe(0)
    expect(once(remap, { signal: 0, inLo: -1, inHi: 1, outLo: 0, outHi: 1 }, {})).toBe(0.5)
    expect(once(remap, { signal: 1, inLo: -1, inHi: 1, outLo: 0, outHi: 1 }, {})).toBe(1)
  })

  it('handles zero input range by returning outLo', () => {
    expect(once(remap, { signal: 5, inLo: 0, inHi: 0, outLo: 7, outHi: 9 }, {})).toBe(7)
  })
})

describe('gate', () => {
  it('passes signal inside the window', () => {
    expect(
      once(gate, { signal: 1, closed: 0, period: 1, lo: 0.2, hi: 0.5 }, { t: 0.3 }),
    ).toBe(1)
  })
  it('returns closed value outside the window', () => {
    expect(
      once(gate, { signal: 1, closed: -1, period: 1, lo: 0.2, hi: 0.5 }, { t: 0.7 }),
    ).toBe(-1)
  })
  it('wraps phase across periods', () => {
    // t=1.3 → phase = 0.3, inside [0.2, 0.5]
    expect(
      once(gate, { signal: 1, closed: 0, period: 1, lo: 0.2, hi: 0.5 }, { t: 1.3 }),
    ).toBe(1)
  })
})

describe('phaseGate', () => {
  it('reads ctx.phase directly', () => {
    expect(
      once(phaseGate, { signal: 1, closed: 0, lo: 0.2, hi: 0.5 }, { phase: 0.3 }),
    ).toBe(1)
    expect(
      once(phaseGate, { signal: 1, closed: -1, lo: 0.2, hi: 0.5 }, { phase: 0.7 }),
    ).toBe(-1)
  })

  it('defaults to phase=0 when ctx.phase is missing', () => {
    // lo=0, hi=0.1 → 0 is inside
    expect(once(phaseGate, { signal: 1, closed: 0, lo: 0, hi: 0.1 }, {})).toBe(1)
  })
})

describe('perlin1D', () => {
  it('produces values inside [lo, hi]', () => {
    const inst = instantiate(perlin1D)
    inst.params.lo.dial.value = 0
    inst.params.hi.dial.value = 1
    inst.params.rate.dial.value = 1
    for (let i = 0; i < 100; i++) {
      const v = sampleSource(inst, { t: i * 0.1 })
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for fixed (seed, t)', () => {
    const a = instantiate(perlin1D)
    const b = instantiate(perlin1D)
    a.params.seed.dial.value = 7
    b.params.seed.dial.value = 7
    expect(sampleSource(a, { t: 0.7 })).toBeCloseTo(sampleSource(b, { t: 0.7 }))
  })

  it('is smooth — consecutive samples close together', () => {
    const inst = instantiate(perlin1D)
    inst.params.rate.dial.value = 1
    const v1 = sampleSource(inst, { t: 0.5 })
    const v2 = sampleSource(inst, { t: 0.5001 })
    expect(Math.abs(v2 - v1)).toBeLessThan(0.01)
  })

  it('equals zero at integer grid points (gradient noise)', () => {
    // At integer x, both endpoints contribute zero (distance = 0 or 1
    // weighted by t=0), so the value at the integer is exactly the
    // midpoint of [lo, hi]. With lo=-1, hi=1 → 0.
    const inst = instantiate(perlin1D)
    inst.params.lo.dial.value = -1
    inst.params.hi.dial.value = 1
    inst.params.rate.dial.value = 1
    const v = sampleSource(inst, { t: 3 })
    expect(v).toBeCloseTo(0, 1)
  })

  it('output spans a meaningful fraction of [lo, hi] over many samples', () => {
    // 1D perlin can't theoretically reach the exact extremes (gradient
    // alignment is rare), but over a long range it should cover most
    // of the range. Assert that we see both bottom and top halves.
    const inst = instantiate(perlin1D)
    inst.params.seed.dial.value = 1
    inst.params.lo.dial.value = 0
    inst.params.hi.dial.value = 1
    inst.params.rate.dial.value = 1
    let min = Infinity, max = -Infinity
    for (let i = 0; i < 5000; i++) {
      const v = sampleSource(inst, { t: i * 0.05 })
      if (v < min) min = v
      if (v > max) max = v
    }
    // Confirm we actually hit close to both ends — the user must be
    // able to see the modulation reach near lo and near hi.
    expect(min).toBeLessThan(0.15)
    expect(max).toBeGreaterThan(0.85)
  })
})

describe('fbm', () => {
  it('produces values inside [lo, hi]', () => {
    const inst = instantiate(fbm)
    inst.params.lo.dial.value = 0
    inst.params.hi.dial.value = 1
    inst.params.rate.dial.value = 1
    inst.params.octaves.dial.value = 4
    for (let i = 0; i < 100; i++) {
      const v = sampleSource(inst, { t: i * 0.1 })
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for fixed (seed, t)', () => {
    const a = instantiate(fbm)
    const b = instantiate(fbm)
    a.params.seed.dial.value = 13
    b.params.seed.dial.value = 13
    expect(sampleSource(a, { t: 0.4 })).toBeCloseTo(sampleSource(b, { t: 0.4 }))
  })

  it('more octaves produces a different (higher-detail) trajectory', () => {
    const a = instantiate(fbm)
    const b = instantiate(fbm)
    a.params.seed.dial.value = 1; a.params.octaves.dial.value = 1
    b.params.seed.dial.value = 1; b.params.octaves.dial.value = 5
    // At least one sample should differ — single-octave is just
    // smooth perlin, multi-octave overlays smaller scales.
    let differed = false
    for (let i = 0; i < 20; i++) {
      const va = sampleSource(a, { t: i * 0.13 })
      const vb = sampleSource(b, { t: i * 0.13 })
      if (Math.abs(va - vb) > 1e-3) { differed = true; break }
    }
    expect(differed).toBe(true)
  })

  it('output spans a meaningful fraction of [lo, hi] over many samples', () => {
    const inst = instantiate(fbm)
    inst.params.seed.dial.value = 1
    inst.params.lo.dial.value = 0
    inst.params.hi.dial.value = 1
    inst.params.rate.dial.value = 1
    inst.params.octaves.dial.value = 4
    let min = Infinity, max = -Infinity
    for (let i = 0; i < 5000; i++) {
      const v = sampleSource(inst, { t: i * 0.05 })
      if (v < min) min = v
      if (v > max) max = v
    }
    expect(min).toBeLessThan(0.15)
    expect(max).toBeGreaterThan(0.85)
  })
})

describe('brown', () => {
  it('produces values inside [lo, hi]', () => {
    const inst = instantiate(brown)
    inst.params.lo.dial.value = 0
    inst.params.hi.dial.value = 1
    inst.params.rate.dial.value = 5
    for (let i = 0; i < 200; i++) {
      const v = sampleSource(inst, { dt: 1 / 60 })
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('two instances with same seed produce same walk', () => {
    const a = instantiate(brown)
    const b = instantiate(brown)
    a.params.seed.dial.value = 42
    b.params.seed.dial.value = 42
    for (let i = 0; i < 50; i++) {
      const va = sampleSource(a, { dt: 1 / 60 })
      const vb = sampleSource(b, { dt: 1 / 60 })
      expect(va).toBeCloseTo(vb)
    }
  })

  it('two instances accumulate independently', () => {
    const a = instantiate(brown)
    const b = instantiate(brown)
    for (let i = 0; i < 100; i++) sampleSource(a, { dt: 1 / 60 })
    // b at sample 1 should not match a at sample 101
    const va = sampleSource(a, { dt: 1 / 60 })
    const vb = sampleSource(b, { dt: 1 / 60 })
    expect(va).not.toBeCloseTo(vb)
  })
})

import { describe, expect, it } from 'vitest'
import {
  add,
  brown,
  fbm,
  gate,
  instantiate,
  lerp,
  mul,
  perlin1D,
  phaseGate,
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
function once<T>(
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
  it('is bipolar: zero after a dt=0 step with phase=0', () => {
    // A dt=0 step leaves the accumulator at 0 → sin(0) = 0, the midpoint.
    expect(once(sine, { freq: 1, phase: 0 }, { dt: 0 })).toBeCloseTo(0)
  })

  it('peaks at +1 a quarter cycle in', () => {
    // freq = 1 Hz; one dt=0.25 step → phase 0.25 → sin(π/2) = 1
    expect(once(sine, { freq: 1, phase: 0 }, { dt: 0.25 })).toBeCloseTo(1)
  })

  it('troughs at -1 three-quarters of a cycle in', () => {
    const s = instantiate(sine)
    s.params.freq.dial.value = 1
    sampleSource(s, { dt: 0.75 }) // phase 0.75 → sin(3π/2) = -1
    expect(sampleSource(s, { dt: 0 })).toBeCloseTo(-1)
  })

  it('phase offsets the wave', () => {
    // phase = π/2 with the accumulator at 0 → sin(π/2) = 1
    expect(once(sine, { freq: 1, phase: Math.PI / 2 }, { dt: 0 })).toBeCloseTo(1)
  })

  it('stays within [-1, 1]', () => {
    const s = instantiate(sine)
    s.params.freq.dial.value = 3
    for (let i = 0; i < 100; i++) {
      const v = sampleSource(s, { dt: 0.037 }) as number
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('phase is continuous across a live freq change (no snap)', () => {
    // Run a while at 1 Hz, then jump freq to 7 Hz mid-stream. The next
    // sample must stay near the previous one — the accumulated phase is
    // preserved, only the slope changes. (Pre-fix, absolute-t rescaling
    // would teleport the phase to freq·t and snap the output.)
    const s = instantiate(sine)
    s.params.freq.dial.value = 1
    const dt = 1 / 60
    let prev = 0
    for (let i = 0; i < 40; i++) prev = sampleSource(s, { dt }) as number
    s.params.freq.dial.value = 7
    const next = sampleSource(s, { dt }) as number
    // One step at 7 Hz advances phase by 7/60 ≈ 0.117 cycle; the sine
    // can't move more than ~2π·0.117 ≈ 0.73 in value. Comfortably < 1.
    expect(Math.abs(next - prev)).toBeLessThan(0.8)
  })
})

describe('tri', () => {
  it('starts at -1 with the accumulator at 0', () => {
    // dt=0 → phase 0 → 4·0 - 1 = -1.
    expect(once(tri, { freq: 1, phase: 0 }, { dt: 0 })).toBeCloseTo(-1)
  })

  it('crosses zero (rising) at quarter cycle', () => {
    expect(once(tri, { freq: 1, phase: 0 }, { dt: 0.25 })).toBeCloseTo(0)
  })

  it('peaks at +1 at half cycle', () => {
    expect(once(tri, { freq: 1, phase: 0 }, { dt: 0.5 })).toBeCloseTo(1)
  })

  it('phase param offsets the wave', () => {
    // phase 0.25 with the accumulator at 0 → rising zero crossing.
    expect(once(tri, { freq: 1, phase: 0.25 }, { dt: 0 })).toBeCloseTo(0)
  })

  it('stays within [-1, 1]', () => {
    const s = instantiate(tri)
    s.params.freq.dial.value = 2
    for (let i = 0; i < 100; i++) {
      const v = sampleSource(s, { dt: 0.041 }) as number
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('phase is continuous across a live freq change (no snap)', () => {
    const s = instantiate(tri)
    s.params.freq.dial.value = 1
    const dt = 1 / 60
    let prev = 0
    for (let i = 0; i < 40; i++) prev = sampleSource(s, { dt }) as number
    s.params.freq.dial.value = 9
    const next = sampleSource(s, { dt }) as number
    // One step at 9 Hz advances phase 9/60 = 0.15 cycle; triangle slope
    // is ±4/cycle so |Δ| ≤ 4·0.15 = 0.6.
    expect(Math.abs(next - prev)).toBeLessThan(0.7)
  })
})

describe('saw', () => {
  it('starts near -1, climbs toward +1 across one cycle', () => {
    expect(once(saw, { freq: 1, phase: 0 }, { dt: 0 })).toBeCloseTo(-1)
    expect(once(saw, { freq: 1, phase: 0 }, { dt: 0.999999 })).toBeCloseTo(1, 5)
  })

  it('crosses zero at half cycle', () => {
    expect(once(saw, { freq: 1, phase: 0 }, { dt: 0.5 })).toBeCloseTo(0)
  })

  it('phase param offsets the ramp', () => {
    // phase 0.5 with the accumulator at 0 → 2·0.5 - 1 = 0.
    expect(once(saw, { freq: 1, phase: 0.5 }, { dt: 0 })).toBeCloseTo(0)
  })

  it('phase is continuous across a live freq change (no snap)', () => {
    const s = instantiate(saw)
    s.params.freq.dial.value = 1
    const dt = 1 / 60
    // Land somewhere mid-ramp (away from the wrap discontinuity).
    let prev = 0
    for (let i = 0; i < 20; i++) prev = sampleSource(s, { dt }) as number
    s.params.freq.dial.value = 6
    const next = sampleSource(s, { dt }) as number
    // 6/60 = 0.1 cycle → saw slope 2/cycle → |Δ| ≤ 0.2 away from a wrap.
    expect(Math.abs(next - prev)).toBeLessThan(0.3)
  })
})

describe('square', () => {
  it('is +1 in the first half, -1 in the second (duty=0.5)', () => {
    expect(once(square, { freq: 1, duty: 0.5, phase: 0 }, { dt: 0.1 })).toBe(1)
    // A single dt=0.7 step lands phase at 0.7 → second half → -1.
    expect(once(square, { freq: 1, duty: 0.5, phase: 0 }, { dt: 0.7 })).toBe(-1)
  })

  it('duty controls the high fraction of the cycle', () => {
    expect(once(square, { freq: 1, duty: 0.2, phase: 0 }, { dt: 0.1 })).toBe(1)
    expect(once(square, { freq: 1, duty: 0.2, phase: 0 }, { dt: 0.3 })).toBe(-1)
  })

  it('duty ratio: high for `duty` of the cycle when swept finely', () => {
    const s = instantiate(square)
    s.params.freq.dial.value = 1
    s.params.duty.dial.value = 0.3
    const N = 1000
    let high = 0
    for (let i = 0; i < N; i++) if (sampleSource(s, { dt: 1 / N }) === 1) high++
    expect(high / N).toBeCloseTo(0.3, 1)
  })

  it('phase edge is continuous across a live freq change (no false flip)', () => {
    // Sitting inside the high region, a freq change must not jump the
    // phase across the duty edge on the next small step.
    const s = instantiate(square)
    s.params.freq.dial.value = 1
    s.params.duty.dial.value = 0.5
    const dt = 1 / 240
    let prev = 0
    for (let i = 0; i < 30; i++) prev = sampleSource(s, { dt }) as number // phase ≈ 0.125
    s.params.freq.dial.value = 12
    const next = sampleSource(s, { dt }) as number // phase ≈ 0.175, still < 0.5
    expect(next).toBe(prev)
  })
})

describe('whiteNoise', () => {
  it('produces values inside [-1, 1]', () => {
    const inst = instantiate(whiteNoise)
    inst.params.seed.dial.value = 42
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
  it('produces values inside [-1, 1]', () => {
    const inst = instantiate(valueNoise)
    inst.params.rate.dial.value = 3
    for (let i = 0; i < 200; i++) {
      const v = sampleSource(inst, { dt: 0.07 })
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic: same seed + same dt sequence → same outputs', () => {
    const a = instantiate(valueNoise)
    const b = instantiate(valueNoise)
    a.params.seed.dial.value = 5
    b.params.seed.dial.value = 5
    for (let i = 0; i < 20; i++) {
      expect(sampleSource(a, { dt: 0.03 })).toBeCloseTo(
        sampleSource(b, { dt: 0.03 }) as number,
      )
    }
  })

  it('changes smoothly step to step (consecutive samples are close)', () => {
    const inst = instantiate(valueNoise)
    inst.params.rate.dial.value = 1
    // Advance to mid-domain, then take a tiny step.
    for (let i = 0; i < 50; i++) sampleSource(inst, { dt: 0.01 })
    const v1 = sampleSource(inst, { dt: 0 }) as number
    const v2 = sampleSource(inst, { dt: 0.001 }) as number
    expect(Math.abs(v2 - v1)).toBeLessThan(0.1)
  })

  it('position is continuous across a live rate change (no teleport)', () => {
    // Advance at rate 1, then jump rate to 15 mid-stream. The next
    // sample must stay near the previous — position accumulates, so a
    // rate change only bends the drift speed. (Pre-fix, position =
    // rate·t would teleport and snap the output.)
    const s = instantiate(valueNoise)
    s.params.rate.dial.value = 1
    const dt = 1 / 60
    let prev = 0
    for (let i = 0; i < 40; i++) prev = sampleSource(s, { dt }) as number
    s.params.rate.dial.value = 15
    const next = sampleSource(s, { dt }) as number
    // One step now advances position 15/60 = 0.25 of a control-point
    // interval — a fraction of one eased segment, so a modest move.
    expect(Math.abs(next - prev)).toBeLessThan(0.6)
  })
})


describe('smooth', () => {
  it('initializes to first signal value', () => {
    const s = instantiate(smooth)
    s.params.signal.dial.value = 0.5
    s.params.tau.dial.value = 0.1
    expect(sampleSource(s, { dt: 1 / 60 })).toBe(0.5)
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

describe('add / mul / lerp (signal-space combinators)', () => {
  it('add sums signals', () => {
    expect(once(add, { a: 0.2, b: 0.3 }, {})).toBeCloseTo(0.5)
  })

  it('add can overshoot ±1 — the slot-level clamp bounds it', () => {
    expect(once(add, { a: 0.8, b: 0.8 }, {})).toBeCloseTo(1.6)
  })

  it('mul multiplies signals', () => {
    expect(once(mul, { a: 0.5, b: -0.5 }, {})).toBeCloseTo(-0.25)
  })

  it('lerp at endpoints and midpoint', () => {
    expect(once(lerp, { a: -1, b: 1, t: 0 }, {})).toBe(-1)
    expect(once(lerp, { a: -1, b: 1, t: 1 }, {})).toBe(1)
    expect(once(lerp, { a: -1, b: 1, t: 0.5 }, {})).toBe(0)
  })
})

describe('gate', () => {
  it('passes signal inside the window', () => {
    // One dt=0.3 step at period 1 → phase 0.3, inside [0.2, 0.5].
    expect(
      once(gate, { signal: 1, closed: 0, period: 1, lo: 0.2, hi: 0.5 }, { dt: 0.3 }),
    ).toBe(1)
  })
  it('returns closed value outside the window', () => {
    expect(
      once(gate, { signal: 1, closed: -1, period: 1, lo: 0.2, hi: 0.5 }, { dt: 0.7 }),
    ).toBe(-1)
  })
  it('wraps phase across periods', () => {
    // Accumulate to 1.3 → wrapped phase 0.3, inside [0.2, 0.5].
    const g = instantiate(gate)
    g.params.signal.dial.value = 1
    g.params.closed.dial.value = 0
    g.params.period.dial.value = 1
    g.params.lo.dial.value = 0.2
    g.params.hi.dial.value = 0.5
    sampleSource(g, { dt: 1.0 })
    expect(sampleSource(g, { dt: 0.3 })).toBe(1)
  })
  it('phase is continuous across a live period change (no snap)', () => {
    // Sit open inside the window, then change period. The next small
    // step must not teleport the phase out of the window. (Pre-fix,
    // phase = t/period would jump when period changed.)
    const g = instantiate(gate)
    g.params.signal.dial.value = 1
    g.params.closed.dial.value = -1
    g.params.period.dial.value = 1
    g.params.lo.dial.value = 0
    g.params.hi.dial.value = 0.5
    // Accumulate to phase ≈ 0.25, well inside [0, 0.5].
    for (let i = 0; i < 15; i++) sampleSource(g, { dt: 1 / 60 })
    g.params.period.dial.value = 4 // would jerk phase to ~t/4 pre-fix
    // Next step advances only dt/4 ≈ 0.004 → phase ≈ 0.254, still open.
    expect(sampleSource(g, { dt: 1 / 60 })).toBe(1)
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
  it('produces values inside [-1, 1]', () => {
    const inst = instantiate(perlin1D)
    inst.params.rate.dial.value = 1
    for (let i = 0; i < 100; i++) {
      const v = sampleSource(inst, { dt: 0.1 })
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic: same seed + same dt sequence → same outputs', () => {
    const a = instantiate(perlin1D)
    const b = instantiate(perlin1D)
    a.params.seed.dial.value = 7
    b.params.seed.dial.value = 7
    for (let i = 0; i < 20; i++) {
      expect(sampleSource(a, { dt: 0.07 })).toBeCloseTo(
        sampleSource(b, { dt: 0.07 }) as number,
      )
    }
  })

  it('is smooth — consecutive samples close together', () => {
    const inst = instantiate(perlin1D)
    inst.params.rate.dial.value = 1
    for (let i = 0; i < 5; i++) sampleSource(inst, { dt: 0.1 }) // x = 0.5
    const v1 = sampleSource(inst, { dt: 0 }) as number
    const v2 = sampleSource(inst, { dt: 0.0001 }) as number
    expect(Math.abs(v2 - v1)).toBeLessThan(0.02)
  })

  it('equals zero at integer grid points (gradient noise)', () => {
    // At integer x, both endpoints contribute zero (distance = 0 or 1
    // weighted by f=0), so the signal at the integer is exactly the
    // bipolar midpoint: 0. Accumulate exactly to x = 3 via three dt=1
    // steps at rate 1.
    const inst = instantiate(perlin1D)
    inst.params.rate.dial.value = 1
    let v = 0
    for (let i = 0; i < 3; i++) v = sampleSource(inst, { dt: 1 }) as number
    expect(v).toBeCloseTo(0, 1)
  })

  it('output spans a meaningful fraction of [-1, 1] over many samples', () => {
    // 1D perlin can't theoretically reach the exact extremes (gradient
    // alignment is rare), but over a long range it should cover most
    // of the signal range — both bottom and top.
    const inst = instantiate(perlin1D)
    inst.params.seed.dial.value = 1
    inst.params.rate.dial.value = 1
    let min = Infinity, max = -Infinity
    for (let i = 0; i < 5000; i++) {
      const v = sampleSource(inst, { dt: 0.05 }) as number
      if (v < min) min = v
      if (v > max) max = v
    }
    // Confirm we actually hit close to both ends — the user must be
    // able to see the modulation reach near -1 and near +1.
    expect(min).toBeLessThan(-0.7)
    expect(max).toBeGreaterThan(0.7)
  })

  it('position is continuous across a live rate change (no teleport)', () => {
    const s = instantiate(perlin1D)
    s.params.seed.dial.value = 1
    s.params.rate.dial.value = 1
    const dt = 1 / 60
    let prev = 0
    for (let i = 0; i < 40; i++) prev = sampleSource(s, { dt }) as number
    s.params.rate.dial.value = 15
    const next = sampleSource(s, { dt }) as number
    // 15/60 = 0.25 of a grid interval; perlin is C² and gentle, so a
    // quarter-cell step stays modest.
    expect(Math.abs(next - prev)).toBeLessThan(0.6)
  })
})

describe('fbm', () => {
  it('produces values inside [-1, 1]', () => {
    const inst = instantiate(fbm)
    inst.params.rate.dial.value = 1
    inst.params.octaves.dial.value = 4
    for (let i = 0; i < 100; i++) {
      const v = sampleSource(inst, { dt: 0.1 })
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic: same seed + same dt sequence → same outputs', () => {
    const a = instantiate(fbm)
    const b = instantiate(fbm)
    a.params.seed.dial.value = 13
    b.params.seed.dial.value = 13
    for (let i = 0; i < 20; i++) {
      expect(sampleSource(a, { dt: 0.04 })).toBeCloseTo(
        sampleSource(b, { dt: 0.04 }) as number,
      )
    }
  })

  it('more octaves produces a different (higher-detail) trajectory', () => {
    const a = instantiate(fbm)
    const b = instantiate(fbm)
    a.params.seed.dial.value = 1; a.params.octaves.dial.value = 1
    b.params.seed.dial.value = 1; b.params.octaves.dial.value = 5
    // At least one sample should differ — single-octave is just
    // smooth perlin, multi-octave overlays smaller scales. Drive both
    // with the same dt sequence so only octave count differs.
    let differed = false
    for (let i = 0; i < 20; i++) {
      const va = sampleSource(a, { dt: 0.13 }) as number
      const vb = sampleSource(b, { dt: 0.13 }) as number
      if (Math.abs(va - vb) > 1e-3) { differed = true; break }
    }
    expect(differed).toBe(true)
  })

  it('output spans a meaningful fraction of [-1, 1] over many samples', () => {
    const inst = instantiate(fbm)
    inst.params.seed.dial.value = 1
    inst.params.rate.dial.value = 1
    inst.params.octaves.dial.value = 4
    let min = Infinity, max = -Infinity
    for (let i = 0; i < 5000; i++) {
      const v = sampleSource(inst, { dt: 0.05 }) as number
      if (v < min) min = v
      if (v > max) max = v
    }
    expect(min).toBeLessThan(-0.7)
    expect(max).toBeGreaterThan(0.7)
  })

  it('position is continuous across a live rate change (no teleport)', () => {
    const s = instantiate(fbm)
    s.params.seed.dial.value = 1
    s.params.rate.dial.value = 1
    s.params.octaves.dial.value = 4
    const dt = 1 / 60
    let prev = 0
    for (let i = 0; i < 40; i++) prev = sampleSource(s, { dt }) as number
    s.params.rate.dial.value = 15
    const next = sampleSource(s, { dt }) as number
    // Base position advances 0.25 of a cell; higher octaves move faster
    // but at proportionally smaller amplitude, so the sum stays modest.
    expect(Math.abs(next - prev)).toBeLessThan(0.7)
  })
})

describe('brown', () => {
  it('produces values inside [-1, 1]', () => {
    const inst = instantiate(brown)
    inst.params.rate.dial.value = 5
    for (let i = 0; i < 200; i++) {
      const v = sampleSource(inst, { dt: 1 / 60 })
      expect(v).toBeGreaterThanOrEqual(-1)
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

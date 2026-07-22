import { describe, expect, it } from 'vitest'
import { decayBeta, decaySurvival, halationStep } from '../src/math'

describe('decaySurvival', () => {
  it('returns persistence unchanged at exactly one 60fps frame', () => {
    expect(decaySurvival(0.9, 1 / 60)).toBeCloseTo(0.9, 10)
  })

  it('compounds over multiple frames', () => {
    const oneFrame = decaySurvival(0.9, 1 / 60)
    const twoFrames = decaySurvival(0.9, 2 / 60)
    expect(twoFrames).toBeCloseTo(oneFrame * oneFrame, 10)
  })

  it('clamps persistence above 0.9999', () => {
    expect(decaySurvival(1.5, 1 / 60)).toBeCloseTo(decaySurvival(0.9999, 1 / 60), 10)
  })

  it('clamps persistence below 0.0001', () => {
    expect(decaySurvival(-1, 1 / 60)).toBeCloseTo(decaySurvival(0.0001, 1 / 60), 10)
  })

  it('never returns NaN for zero dt', () => {
    expect(Number.isNaN(decaySurvival(0.9, 0))).toBe(false)
    expect(decaySurvival(0.9, 0)).toBeCloseTo(1, 10)
  })
})

describe('decayBeta', () => {
  it('passes through values above the floor', () => {
    expect(decayBeta(0.6)).toBe(0.6)
  })

  it('floors at 0.1', () => {
    expect(decayBeta(0)).toBe(0.1)
    expect(decayBeta(-5)).toBe(0.1)
  })
})

describe('halationStep', () => {
  it('scales sigma by the halo/canvas resolution ratio', () => {
    // halo target at half canvas res: 1 CSS px of radius = 0.5 FBO px.
    const step = halationStep({
      haloSigmaPx: 8,
      haloWidthPx: 50,
      canvasWidthPx: 100,
      taps: 8,
    })
    expect(step.sigmaTaps).toBeCloseTo((8 * 0.5) / 8, 10)
    expect(step.stepMag).toBeCloseTo(8 * step.sigmaTaps, 10)
  })

  it('floors sigmaTaps at 0.5 for a tiny radius', () => {
    const step = halationStep({
      haloSigmaPx: 0.01,
      haloWidthPx: 50,
      canvasWidthPx: 100,
      taps: 8,
    })
    expect(step.sigmaTaps).toBe(0.5)
  })

  it('floors canvasWidthPx at 1 to avoid dividing by zero', () => {
    const step = halationStep({
      haloSigmaPx: 8,
      haloWidthPx: 50,
      canvasWidthPx: 0,
      taps: 8,
    })
    // canvasWidthPx clamped to 1, so haloPxPerCssPx = haloWidthPx / 1 = 50.
    const expectedSigmaTaps = (8 * 50) / 8
    expect(step.sigmaTaps).toBeCloseTo(expectedSigmaTaps, 10)
  })
})

import { describe, expect, it } from 'vitest'
import { resolvePreset } from '../src/resolve-preset'
import { PHOSPHOR_P31, PHOSPHOR_P7 } from '../src/presets'

describe('resolvePreset', () => {
  it('fills every field from PHOSPHOR_P31 when given an empty preset', () => {
    const uniforms = resolvePreset({})
    expect(uniforms.persistence).toBe(PHOSPHOR_P31.persistence)
    expect(uniforms.beta).toBe(PHOSPHOR_P31.persistenceBeta)
    expect(uniforms.intensity).toBe(PHOSPHOR_P31.intensity)
    expect(uniforms.haloI).toBe(PHOSPHOR_P31.halationStrength)
    expect(uniforms.haloSigmaPx).toBe(PHOSPHOR_P31.halationSigma)
    expect(uniforms.satKnee).toBe(PHOSPHOR_P31.saturationKnee)
    expect(uniforms.whiteHot).toBe(PHOSPHOR_P31.whiteHot)
    expect(uniforms.grain).toBe(PHOSPHOR_P31.grain)
  })

  it('prefers explicit fields over PHOSPHOR_P31 defaults', () => {
    const uniforms = resolvePreset({ persistence: 0.5, intensity: 2 })
    expect(uniforms.persistence).toBe(0.5)
    expect(uniforms.intensity).toBe(2)
    // Untouched fields still fall back to P31.
    expect(uniforms.beta).toBe(PHOSPHOR_P31.persistenceBeta)
  })

  it('resolves a different preset object independently of P31', () => {
    const uniforms = resolvePreset(PHOSPHOR_P7)
    expect(uniforms.persistence).toBe(PHOSPHOR_P7.persistence)
    expect(uniforms.haloI).toBe(PHOSPHOR_P7.halationStrength)
  })

  it('leaves phosphorColor undefined when omitted (resolved live by the surface)', () => {
    expect(resolvePreset({}).phosphorColor).toBeUndefined()
    expect(resolvePreset({ phosphorColor: [1, 0, 0] }).phosphorColor).toEqual([1, 0, 0])
  })

  it('defaults whitePoint to pure white regardless of preset', () => {
    expect(resolvePreset({}).whitePoint).toEqual([1, 1, 1])
  })

  it('defaults alpha and resolutionScale to 1', () => {
    const uniforms = resolvePreset({})
    expect(uniforms.alpha).toBe(1)
    expect(uniforms.resolutionScale).toBe(1)
  })

  it('falls back to hardcoded defaults when a field is omitted from both preset and P31', () => {
    // flicker is 0 on P31; verify a field P31 sometimes omits (P7 doesn't set flicker either)
    // still resolves to a defined number rather than undefined.
    const uniforms = resolvePreset(PHOSPHOR_P7)
    expect(typeof uniforms.flicker).toBe('number')
  })
})
